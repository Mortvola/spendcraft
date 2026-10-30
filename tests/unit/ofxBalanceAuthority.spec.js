import { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents } from
  '../../common/moneyCents.ts'
import { encodeMonetaryAmount } from '../../app/Services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { URL } from 'node:url'
import ts from 'typescript'
import { XMLParser } from 'fast-xml-parser'
import { DateTime } from 'luxon'

// Execute the production method with real parsing and inert persistence adapters.
// No application bootstrap, model import or database connection is involved.
async function currentMethod() {
  const source = await readFile(new URL('../../app/Models/Account.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('Account.ts', source, ts.ScriptTarget.Latest, true)
  let body
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'processOfx') body = node.body
      .getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!body) throw new Error('Production processOfx method not found')
  return ts.transpileModule(`(async function(data, budget, user) ${body})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
}

function document(rows = [], ledger = '<LEDGERBAL><BALAMT>1500</LEDGERBAL>') {
  return 'OFXHEADER:100\n\n<OFX><SIGNONMSGSRSV1><SONRS><FI><FID>1</FI></SONRS></SIGNONMSGSRSV1>'
    + '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>test</CCACCTFROM>'
    + `<BANKTRANLIST>${rows.map(({ id = 'one', amount = -50, date = '20250210' }) =>
      `<STMTTRN><DTPOSTED>${date}120000[0:GMT]\
<TRNAMT>${amount}<FITID>${id}<NAME>Movement</STMTTRN>`).join('')}</BANKTRANLIST>`
    + `${ledger}</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`
}

async function fixture() {
  const calls = []
  const links = []
  const categories = new Map()
  function category(id, balance = 0) {
    const row = { id, balance, async save() { calls.push(['category', id, this.balance]) } }
    categories.set(id, row)
    return row
  }
  const unassigned = category(1)
  const pool = category(2)
  class Transaction {
    constructor() { this.id = links.length + 1; this.deleted = false }
    useTransaction() { return this }
    fill(values) { Object.assign(this, values); return this }
    merge(values) { return this.fill(values) }
    async save() { calls.push(['transaction', this.id]); return this }
    related() { return { create: async () => { calls.push('log') } } }
  }
  const account = { tracking: 'Transactions', balance: 1000, plaidBalance: 1400,
    startDate: DateTime.fromISO('2025-02-01'), $trx: {}, id: 10, name: 'Checking',
    async save() { calls.push(['account', this.balance, this.plaidBalance]) },
    async updateAccountBalanceHistory() { throw new Error('OFX must not write history') },
    async updateStartingBalance() { calls.push(['opening', this.balance]) },
    related() {
      return {
        query() {
          let identity
          return { where(_field, value) { identity = value; return this },
            async first() { return links.find((link) => link.providerTransactionId === identity) },
            async limit(count) { return links.filter((link) => link
              .providerTransactionId === identity).slice(0, count) } }
        },
        async create(values) {
          const transaction = f.lastTransaction
          const row = { pending: false, ...values,
            merge(next) { Object.assign(this, next); return this },
            async save() { calls.push(['link', this.amount]); return this },
            related() { return { query: () => ({ firstOrFail: async () => transaction }) } },
            transaction,
          }
          links.push(row)
          return row
        },
      }
    },
  }
  const f = { account, calls, links, categories, category, lastTransaction: null }
  class PersistedTransaction extends Transaction {
    async save() { f.lastTransaction = this; return super.save() }
  }
  const categoryQuery = { where(field, id) { if (field === 'id') this.id = id; return this },
    whereHas() { return this }, async firstOrFail() { return categories.get(this.id) } }
  const runMethod = runInNewContext(await currentMethod(), {
    addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents, encodeMonetaryAmount,
    requestCategoryStorage: (model) => model, hasCategoryStorage: () => true,
      validateStoredCategoryConservation: async () => undefined,
    AccountType: { Loan: 'loan' }, TransactionType: { REGULAR_TRANSACTION: 0 },
    XMLParser, DateTime, Transaction: PersistedTransaction,
    Category: { query: () => Object.create(categoryQuery) },
    TrackingType: { Transactions: 'Transactions', Balances: 'Balances' },
    validateTransactionSplits(amount, allocations) {
      if (Math.round(allocations.reduce((sum, row) => sum + row.amount, 0) * 100) !== Math.round(
        amount * 100)) throw new Error('Invalid splits')
    },
  })
  const budget = { id: 3, async getUnassignedCategory() { return unassigned },
    async getFundingPoolCategory() { return pool } }
  f.run = (rows, ledger) => runMethod.call(account, document(rows, ledger), budget, { username:
    'test' })
  return f
}

test.group('OFX accounting and provider balance independence', () => {
  test('fractional imports, replay and replacement keep checked cents exact')
    .with([false, true].flatMap(loan => [1, -1].map(sign => ({ loan, sign }))))
    .run(async ({ assert }, { loan, sign }) => {
      const f = await fixture()
      if (loan) f.account.type = 'loan'
      f.account.balance = sign * 0.1
      f.categories.get(1).balance = sign * 0.1
      await f.run([{ amount: sign * 0.2 }], '')
      assert.strictEqual(f.account.balance, sign * 0.3)
      assert.strictEqual(f.categories.get(1).balance, sign * 0.3)
      await f.run([{ amount: sign * 0.2 }], '')
      assert.strictEqual(f.account.balance, sign * 0.3)
      await f.run([{ amount: sign * 0.4 }], '')
      assert.strictEqual(f.account.balance, sign * 0.5)
      assert.strictEqual(f.categories.get(1).balance, sign * 0.5)
    })

  test('Loan imports round balance effects without altering provider values', async ({ assert }) =>
    {
    const f = await fixture()
    f.account.type = 'loan'
    f.account.balance = 0.1
    await f.run([{ amount: 0.005 }], '')
    assert.strictEqual(f.account.balance, 0.11)
    assert.strictEqual(f.links[0].amount, 0.005)
    assert.strictEqual(f.links[0].transaction.categories[0].amount, 0.005)
  })

  test('ledger-only observation never replaces accounting balance or writes history')
    .with([1500, -1500, 0, 0.005]).run(async ({ assert }, ledger) => {
      const f = await fixture()
      await f.run([], `<LEDGERBAL><BALAMT>${ledger}</LEDGERBAL>`)
      assert.equal(f.account.balance, 1000)
      assert.equal(f.account.plaidBalance, ledger)
      assert.deepInclude(f.calls, ['opening', 1000])
    })

  test('absent ledger preserves provider balance and still posts Transactions', async ({
    assert }) => {
    const f = await fixture()
    await f.run([{}], '')
    assert.equal(f.account.balance, 950)
    assert.equal(f.account.plaidBalance, 1400)
    assert.equal(f.categories.get(1).balance, -50)
    assert.deepInclude(f.calls, ['opening', 950])
  })

  test('malformed supplied ledger fails before any mutation')
    .with(['<LEDGERBAL/>', '<LEDGERBAL><BALAMT></BALAMT></LEDGERBAL>',
      '<LEDGERBAL><BALAMT>garbage</LEDGERBAL>', '<LEDGERBAL><BALAMT>Infinity</LEDGERBAL>'])
    .run(async ({ assert }, ledger) => {
      const f = await fixture()
      await assert.rejects(() => f.run([{}], ledger), /Invalid OFX ledger balance/)
      assert.deepEqual(f.calls, [])
      assert.equal(f.account.balance, 1000); assert.equal(f.account.plaidBalance, 1400)
    })

  test('new, replay and ledger change compose independently', async ({ assert }) => {
    const f = await fixture()
    await f.run([{}])
    assert.equal(f.account.balance, 950); assert.equal(f.account.plaidBalance, 1500)
    const count = f.links.length
    await f.run([{}], '<LEDGERBAL><BALAMT>1600</LEDGERBAL>')
    assert.equal(f.account.balance, 950); assert.equal(f.account.plaidBalance, 1600)
    assert.equal(f.categories.get(1).balance, -50)
    assert.lengthOf(f.links, count)
  })

  test('modification applies old/new amount difference', async ({ assert }) => {
    const f = await fixture()
    await f.run([{ amount: 10 }], '')
    await f.run([{ amount: 15 }], '')
    assert.equal(f.account.balance, 1015)
    assert.equal(f.categories.get(1).balance, 15)
  })

  test('date crossings independently remove and add Account and Category effects', async ({
    assert }) => {
    const f = await fixture()
    await f.run([{ amount: 10, date: '20250110' }], '')
    assert.equal(f.account.balance, 1000); assert.equal(f.categories.get(1).balance, 0)
    await f.run([{ amount: 10, date: '20250201' }], '')
    assert.equal(f.account.balance, 1010); assert.equal(f.categories.get(1).balance, 10)
    await f.run([{ amount: 10, date: '20250131' }], '')
    assert.equal(f.account.balance, 1000); assert.equal(f.categories.get(1).balance, 0)
  })

  test('matched pending status suppresses Account only', async ({ assert }) => {
    const f = await fixture()
    await f.run([{ amount: 10, date: '20250110' }], '')
    f.links[0].pending = true
    await f.run([{ amount: 15 }], '')
    assert.equal(f.account.balance, 1000)
    assert.equal(f.categories.get(1).balance, 15)
    assert.isTrue(f.links[0].pending)
  })

  test('restoration reapplies eligible effects once', async ({ assert }) => {
    const f = await fixture()
    await f.run([{ amount: 10 }], '')
    f.links[0].transaction.deleted = true
    f.account.balance = 1000; f.categories.get(1).balance = 0
    await f.run([{ amount: 15 }], '')
    await f.run([{ amount: 15 }], '')
    assert.equal(f.account.balance, 1015); assert.equal(f.categories.get(1).balance, 15)
    assert.isFalse(f.links[0].transaction.deleted)
  })

  test('explicit allocation metadata/order survive replay and amount modification', async ({
    assert }) => {
    const f = await fixture()
    await f.run([{ amount: 10 }], '')
    const explicit = { categoryId: 3, amount: 4, comment: 'User allocation' }
    f.category(3, 4); f.categories.get(1).balance = 6
    f.links[0].transaction.categories = [explicit, { categoryId: 1, amount: 6 }]
    await f.run([{ amount: 15 }], '')
    assert.deepEqual(f.links[0].transaction.categories[0], explicit)
    assert.equal(f.categories.get(3).balance, 4); assert.equal(f.categories.get(1).balance, 11)
  })

  test('ambiguous later identity fails before earlier row can mutate', async ({ assert }) => {
    const f = await fixture()
    await f.run([{ id: 'duplicate' }], '')
    f.links.push(f.links[0]); f.calls.length = 0
    await assert.rejects(() => f.run([{ id: 'new' }, { id: 'duplicate' }], ''),
      /Ambiguous OFX transaction identity/)
    assert.deepEqual(f.calls, [])
  })

  test('omitted Transactions are retained', async ({ assert }) => {
    const f = await fixture()
    await f.run([{ id: 'first' }, { id: 'second' }], '')
    await f.run([{ id: 'second' }], '')
    assert.lengthOf(f.links, 2); assert.equal(f.account.balance, 900)
  })

  test('repeated incoming identity posts once and keeps one linkage', async ({ assert }) => {
    const f = await fixture()
    await f.run([{ amount: 10 }, { amount: 10 }], '')
    assert.equal(f.account.balance, 1010); assert.equal(f.categories.get(1).balance, 10)
    assert.lengthOf(f.links, 1)
  })

  test('restored pending or pre-startDate observation cannot post Account effect')
    .with([{ pending: true, date: '20250210', category: 15 }, { pending: false, date: '20250131',
      category: 0 }])
    .run(async ({ assert }, scenario) => {
      const f = await fixture()
      await f.run([{ amount: 10 }], '')
      f.links[0].transaction.deleted = true; f.links[0].pending = scenario.pending
      f.account.balance = 1000; f.categories.get(1).balance = 0
      await f.run([{ amount: 15, date: scenario.date }], '')
      assert.equal(f.account.balance, 1000); assert.equal(f.categories.get(1).balance, scenario
        .category)
    })

  test('default XML parser identifier normalization remains unchanged', ({ assert }) => {
    assert.deepEqual(new XMLParser().parse(
      '<OFX><FID>001</FID><ACCTID>002</ACCTID><FITID>003</FITID></OFX>'),
      { OFX: { FID: 1, ACCTID: 2, FITID: 3 } })
  })
})
