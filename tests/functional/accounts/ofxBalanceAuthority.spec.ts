import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
// PREPARED ONLY. Requires fresh task-specific PostgreSQL authorization and the
// accepted configured/live pg + pgLog destructive-operation safeguards.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import ace from '@adonisjs/core/services/ace'
import drive from '@adonisjs/drive/services/main'
import OfxUpload from '../../../commands/OfxUpload.js'
import Account from '#models/Account'
import Budget from '#models/Budget'
import Transaction from '#models/Transaction'
import Category from '#models/Category'
import AccountTransaction from '#models/AccountTransaction'
import TransactionLog from '#models/TransactionLog'
import BalanceHistory from '#models/BalanceHistory'
import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { AccountType, TrackingType } from '#common/ResponseTypes'
import type { ApiClient } from '@japa/api-client'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `ofx-authority-${++sequence}`,
      email: `ofx-authority-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: `OFX ${sequence}` })
    const account = await institution.related('accounts').create({ name: 'Accounting',
      balanceCents: parseMoneyCents('1000.00'),
      plaidBalance: 1400, type: AccountType.Credit, subtype: 'credit card', tracking: TrackingType
        .Transactions,
      startDate: DateTime.fromISO('2025-02-01'), rate: 0, closed: false })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    await account.updateStartingBalance(budget, pool)
    await pool.save()
    await account.related('balanceHistory').create({ date: DateTime.fromISO('2025-01-01'),
      balance: 123 })
    const unassigned = await budget.getUnassignedCategory({ client: trx })
    return { budget, user, institution, account, pool, unassigned }
  })
}
type Fixture = Awaited<ReturnType<typeof fixture>>
interface Row { amount: number, date?: string, id?: string }
const ledger = (amount: number) => `<LEDGERBAL><BALAMT>${amount}</LEDGERBAL>`
function document(rows: Row[], observation = ledger(1500)) {
  return 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n'
    + '<OFX><SIGNONMSGSRSV1><SONRS><FI><FID>123</FI></SONRS></SIGNONMSGSRSV1>'
    +
      '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>authority-account</CCACCTFRO\
M>'
    + `<BANKTRANLIST>${rows.map((row) => `<STMTTRN><DTPOSTED>${row.date ??
      '20250210'}120000[0:GMT]<TRNAMT>${row.amount}<FITID>${row.id ??
      'one'}<NAME>Movement</STMTTRN>`).join('')}</BANKTRANLIST>`
    + `${observation}</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`
}
async function upload(client: ApiClient, f: Fixture, rows: Row[], observation?: string) {
  return client.post(`/api/v1/account/${f.account.id}/ofx`).unsafeJson(document(rows, observation))
    .type('text/plain').loginAs(f.user)
}
async function snapshot(f: Fixture) {
  const account = await db.from('accounts').where('id', f.account.id).first()
  const links = await f.account.related('accountTransactions').query().orderBy('id').preload(
    'transaction')
  const categories = await db.from('categories').join('groups', 'groups.id', 'categories.group_id')
    .where('groups.application_id', f.budget.id).select('categories.*').orderBy('categories.id')
  return { account, categories,
    links: links.map((link) => ({ id: link.id, amount: link.amount, pending: link.pending,
      providerId: link.providerTransactionId, transaction: link.transaction.serialize() })),
    history: await db.from('balance_histories').where('account_id', f.account.id).orderBy('id'),
    logs: await db.from('transaction_logs').where('application_id', f.budget.id).orderBy('id'),
  }
}
async function assertBalances(f: Fixture, expected: number, provider: number, category: number) {
  const account = await Account.findOrFail(f.account.id)
  if (Number(formatMoneyCents(
    account.balanceCents)) !== expected || account.plaidBalance !== provider) throw new Error(
    `Independent Account balances disagree: actual ${Number(formatMoneyCents(
      account.balanceCents))}/${account
    .plaidBalance}; expected ${expected}/${provider}`)
  const raw = await db.rawQuery(
    'SELECT balance::text, plaid_balance::text FROM accounts WHERE id = ?', [account.id])
  if (Number(raw.rows[0].balance) !== expected || Number(raw.rows[0]
    .plaid_balance) !== provider) throw new Error('Raw persistence disagrees')
  const unassigned = await Category.findOrFail(f.unassigned.id)
  if (Number(formatMoneyCents(unassigned.balanceCents)) !== category) throw new Error(
    'Category effect disagrees')
  const pool = await Category.findOrFail(f.pool.id)
  if (Number(formatMoneyCents(pool.balanceCents)) !== 1000) throw new Error(
    'Provider ledger contaminated Pool')
  const opening = await account.related('accountTransactions').query()
    .whereHas('transaction', (query) => query.where('type', 4)).preload('transaction').firstOrFail()
  if (opening.amount !== 1000 || opening.transaction.categories[0].amount !== 1000) throw new Error(
    'Provider ledger contaminated opening')
}

test.group('OFX independent accounting and provider balance (prepared)', () => {
  test('Initial Funding creation, adjustment and repetition retain exact cents')
    .with([false, true].flatMap(loan => [1, -1].map(sign => ({ loan, sign }))))
    .run(async ({ assert }, { loan, sign }) => {
      const f = await fixture()
      const adjust = (balance: number) => db.transaction(async (trx) => {
        const budget = await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate()
          .firstOrFail()
        const account = await Account.findOrFail(f.account.id, { client: trx })
        const pool = await budget.getFundingPoolCategory({ client: trx })
        if (loan) account.type = AccountType.Loan
        account.balanceCents = parseMoneyCents(encodeMonetaryAmount(balance))
        await account.save()
        await account.updateStartingBalance(budget, pool)
        await pool.save()
        return { account, pool }
      })
      // Keep the existing opening row: replacing it exercises the exact delta path.
      const first = await adjust(sign * 0.1)
      assert.strictEqual(first.pool.balanceCents, parseMoneyCents(encodeMonetaryAmount(sign * 0.1)))
      const second = await adjust(sign * 0.3)
      assert.strictEqual(second.pool.balanceCents, parseMoneyCents(encodeMonetaryAmount(
        sign * 0.3)))
      const repeated = await adjust(sign * 0.3)
      assert.strictEqual(repeated.pool.balanceCents, parseMoneyCents(encodeMonetaryAmount(
        sign * 0.3)))
      const opening = await repeated.account.related('accountTransactions').query()
        .whereHas('transaction', query => query.where('type', 4)).firstOrFail()
      assert.strictEqual(opening.amount, sign * 0.3)
      const transaction = await opening.related('transaction').query().firstOrFail()
      assert.strictEqual(transaction.categories[0].amount, sign * 0.3)
      const raw = await db.from('transactions').where('id', transaction.id).firstOrFail()
      assert.strictEqual(typeof raw.categories[0].amount, 'string')
    })

  test('Loan initial-funding failure rolls back Account, opening and Funding Pool changes',
    async ({ assert }) => {
      const f = await fixture()
      const before = await snapshot(f)
      await assert.rejects(() => db.transaction(async trx => {
        const budget = await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate()
          .firstOrFail()
        const account = await Account.findOrFail(f.account.id, { client: trx })
        await account.merge({ type: AccountType.Loan, balanceCents: parseMoneyCents(
          '0.30') }).save()
        const pool = await budget.getFundingPoolCategory({ client: trx })
        await account.updateStartingBalance(budget, pool)
        await pool.save()
        throw new Error('Injected Loan opening failure')
      }), 'Injected Loan opening failure')
      assert.deepEqual(await snapshot(f), before)
    })

  test('supplied positive/negative/zero provider ledger is independent of signed posting')
    .with([1500, -1500, 0]).run(async ({ client, assert }, observation) => {
      const f = await fixture()
      const history = (await snapshot(f)).history
      ;(await upload(client, f, [{ amount: -50 }], ledger(observation))).assertStatus(200)
      await assertBalances(f, 950, observation, -50)
      assert.deepEqual((await snapshot(f)).history, history)
    })

  test('new posting eligibility and absent ledger')
    .with(['20250131', '20250201', '20250202'].flatMap((date) => [-10, 10].map((amount) => ({ date,
      amount }))))
    .run(async ({ client, assert }, row) => {
      const f = await fixture()
      const before = await snapshot(f)
      ;(await upload(client, f, [row], '')).assertStatus(200)
      const effect = row.date >= '20250201' ? row.amount : 0
      await assertBalances(f, 1000 + effect, 1400, effect)
      const after = await snapshot(f)
      assert.deepEqual(after.history, before.history)
      assert.lengthOf(after.links, 2)
      assert.isFalse(after.links.find((link) => link.providerId !== null)?.pending)
    })

  test('ledger-only and replay + changed ledger have zero financial delta', async ({ client,
    assert }) => {
    const f = await fixture()
    ;(await upload(client, f, [], ledger(1600))).assertStatus(200)
    await assertBalances(f, 1000, 1600, 0)
    ;(await upload(client, f, [{ amount: -50 }])).assertStatus(200)
    const before = await snapshot(f)
    ;(await upload(client, f, [{ amount: -50 }], ledger(1700))).assertStatus(200)
    await assertBalances(f, 950, 1700, -50)
    const after = await snapshot(f)
    assert.deepEqual(after.links, before.links)
    assert.deepEqual(after.categories, before.categories)
    assert.deepEqual(after.history, before.history)
    assert.deepEqual(after.logs, before.logs)
  })

  test('malformed or empty supplied observation fails atomically')
    .with(['<LEDGERBAL/>', '<LEDGERBAL><BALAMT></BALAMT></LEDGERBAL>',
      '<LEDGERBAL><BALAMT>bad</LEDGERBAL>', '<LEDGERBAL><BALAMT>Infinity</LEDGERBAL>'])
    .run(async ({ client, assert }, observation) => {
      const f = await fixture()
      const before = await snapshot(f)
      ;(await upload(client, f, [{ amount: -50 }], observation)).assertStatus(500)
      assert.deepEqual(await snapshot(f), before)
    })

  test('old/new amount and date eligibility changes apply net effects')
    .with([{ old: '20250131', next: '20250201' }, { old: '20250201', next: '20250131' }, { old:
      '20250201', next: '20250202' }])
    .run(async ({ client }, dates) => {
      const f = await fixture()
      ;(await upload(client, f, [{ amount: 10, date: dates.old }], '')).assertStatus(200)
      ;(await upload(client, f, [{ amount: 15, date: dates.next }], '')).assertStatus(200)
      const effect = dates.next >= '20250201' ? 15 : 0
      await assertBalances(f, 1000 + effect, 1400, effect)
    })

  test('matched pending row retains pending and affects only Category on crossing', async ({ client,
    assert }) => {
    const f = await fixture()
    ;(await upload(client, f, [{ amount: 10, date: '20250131' }], '')).assertStatus(200)
    const link = await f.account.related('accountTransactions').query().where('provider', 'OFX')
      .firstOrFail()
    await link.merge({ pending: true }).save()
    ;(await upload(client, f, [{ amount: 15 }], '')).assertStatus(200)
    await assertBalances(f, 1000, 1400, 15)
    assert.isTrue((await link.refresh()).pending)
  })

  test('deleted restoration posts once and omission never deletes', async ({ client, assert }) => {
    const f = await fixture()
    ;(await upload(client, f, [{ amount: 10 }], '')).assertStatus(200)
    const link = await f.account.related('accountTransactions').query().where('provider', 'OFX')
      .firstOrFail()
    ;(await client.delete(`/api/v1/transaction/${link.transactionId}`).loginAs(f.user))
      .assertStatus(200)
    ;(await upload(client, f, [{ amount: 15 }], '')).assertStatus(200)
    ;(await upload(client, f, [{ amount: 15 }], '')).assertStatus(200)
    ;(await upload(client, f, [], '')).assertStatus(200)
    await assertBalances(f, 1015, 1400, 15)
    assert.isFalse((await Transaction.findOrFail(link.transactionId)).deleted)
  })

  test('ambiguous existing identity rejects complete upload before any financial mutation', async ({
    client, assert }) => {
    const f = await fixture()
    ;(await upload(client, f, [{ amount: 10 }], '')).assertStatus(200)
    await db.transaction(async (trx) => {
      const transaction = await Transaction.create({ budgetId: f.budget.id, date: DateTime.fromISO(
        '2025-01-01'), categories: [] }, { client: trx })
      await f.account.useTransaction(trx).related('accountTransactions').create({
        transactionId: transaction.id,
        accountId: f.account.id, provider: 'OFX', providerTransactionId:
          '123:authority-account:one', amount: 0 })
    })
    const before = await snapshot(f)
    ;(await upload(client, f, [{ id: 'new', amount: 5 }, { amount: 15 }])).assertStatus(500)
    assert.deepEqual(await snapshot(f), before)
  })

  test('late opening failure rolls back both balances, Category, links, history and logs', async ({
    client, assert }) => {
    const f = await fixture()
    const before = await snapshot(f)
    const maintenance = Account.prototype.updateStartingBalance
    const failure = mock.method(Account.prototype, 'updateStartingBalance', async function (
      this: Account, ...args: Parameters<Account['updateStartingBalance']>) {
      await maintenance.apply(this, args)
      if (this.id === f.account.id) throw new Error('Injected post-opening failure')
    })
    try {
      ;(await upload(client, f, [{ amount: 10 }])).assertStatus(500)
      assert.deepEqual(await snapshot(f), before)
    } finally { failure.mock.restore() }
  })

  test('command shares accounting/provider separation and leaves historical evidence untouched')
    .with([ledger(1600), '']).run(async ({ client, assert }, observation) => {
      const f = await fixture()
      const before = await snapshot(f)
      const command = await ace.create(OfxUpload, ['prepared.ofx'])
      const file = mock.method(drive.use('fs'), 'get', async () => Buffer.from(document([{ amount: -
        50 }], observation)))
      const ask = mock.method(command.prompt, 'ask', async () => f.user.username)
      const choice = mock.method(command.prompt, 'choice', async (title: string) => title ===
        'Select the institution' ? f.institution.name : f.account.name)
      try {
        await command.run()
        await assertBalances(f, 950, observation ? 1600 : 1400, -50)
        // HTTP replay of the same command identity posts no second effect.
        ;(await upload(client, f, [{ amount: -50 }], observation)).assertStatus(200)
        await assertBalances(f, 950, observation ? 1600 : 1400, -50)
        assert.deepEqual((await snapshot(f)).history, before.history)
      } finally { file.mock.restore(); ask.mock.restore(); choice.mock.restore() }
    })

  test('both entry points bind financial writes and run opening once with accounting balance')
    .with(['http', 'command']).run(async ({ client, assert }, entry) => {
      const f = await fixture()
      const history = (await snapshot(f)).history
      const clients = new Set<TransactionClientContract>()
      const writes: { balance: number, provider: number | null }[] = []
      const prototypes: LucidRow[] = [Account.prototype, AccountTransaction.prototype,
        Transaction.prototype, Category.prototype, TransactionLog.prototype]
      const audits = prototypes.map((prototype) => {
        const save = prototype.save
        return mock.method(prototype, 'save', async function (this: LucidRow) {
          if (!this.$trx) throw new Error('Financial write escaped owning transaction')
          clients.add(this.$trx)
          if (this instanceof Account && ('balance' in this.$dirty || 'plaidBalance' in this
            .$dirty)) {
            writes.push({ balance: Number(formatMoneyCents(this.balanceCents)),
              provider: this.plaidBalance })
          }
          return save.call(this)
        })
      })
      const historySave = mock.method(BalanceHistory.prototype, 'save', async () => {
        throw new Error('OFX history write') })
      const maintenance = Account.prototype.updateStartingBalance
      let openingCount = 0
      const opening = mock.method(Account.prototype, 'updateStartingBalance', async function (
        this: Account, ...args: Parameters<Account['updateStartingBalance']>) {
        openingCount++
        assert.equal(this.balanceCents, parseMoneyCents('950.00'))
        assert.equal(this.plaidBalance, 1500)
        await maintenance.apply(this, args)
      })
      const command = await ace.create(OfxUpload, ['prepared.ofx'])
      const file = mock.method(drive.use('fs'), 'get', async () => Buffer.from(document([{ amount: -
        50 }])))
      const ask = mock.method(command.prompt, 'ask', async () => f.user.username)
      const choice = mock.method(command.prompt, 'choice', async (title: string) => title ===
        'Select the institution' ? f.institution.name : f.account.name)
      try {
        if (entry === 'http') (await upload(client, f, [{ amount: -50 }])).assertStatus(200)
        else await command.run()
      } finally {
        audits.forEach((audit) => audit.mock.restore())
        historySave.mock.restore(); opening.mock.restore(); file.mock.restore(); ask.mock.restore();
          choice.mock.restore()
      }
      assert.equal(clients.size, 1)
      assert.equal(openingCount, 1)
      assert.deepEqual(writes, [{ balance: 950, provider: 1500 }])
      await assertBalances(f, 950, 1500, -50)
      assert.deepEqual((await snapshot(f)).history, history)
      const response = await client.get('/api/v1/connected-accounts').loginAs(f.user)
      response.assertStatus(200)
      const returned = response.body().data.find((institution: { id: number }) => institution
        .id === f.institution.id).accounts[0]
      assert.strictEqual(returned.balance, '950.00'); assert.strictEqual(returned.plaidBalance,
        '1500.00')
    })

  test('current numeric identity normalization replays the same logical Transaction', async ({
    client, assert }) => {
    const f = await fixture()
    ;(await upload(client, f, [{ id: '1', amount: -50 }])).assertStatus(200)
    const before = await snapshot(f)
    const body = document([{ id: '0001', amount: -50 }], ledger(1600)).replace('<FID>123',
      '<FID>00123')
    ;(await client.post(`/api/v1/account/${f.account.id}/ofx`).unsafeJson(body).type('text/plain')
      .loginAs(f.user)).assertStatus(200)
    await assertBalances(f, 950, 1600, -50)
    assert.deepEqual((await snapshot(f)).links, before.links)
  })

  test('command rejects malformed observation without posting or changing history', async ({
    assert }) => {
    const f = await fixture()
    const before = await snapshot(f)
    const command = await ace.create(OfxUpload, ['prepared.ofx'])
    const file = mock.method(drive.use('fs'), 'get', async () => Buffer.from(document([{ amount: -
      50 }], '<LEDGERBAL/>')))
    const ask = mock.method(command.prompt, 'ask', async () => f.user.username)
    const choice = mock.method(command.prompt, 'choice', async (title: string) => title ===
      'Select the institution' ? f.institution.name : f.account.name)
    try { await command.run(); assert.deepEqual(await snapshot(f), before) }
    finally { file.mock.restore(); ask.mock.restore(); choice.mock.restore() }
  })

  test('foreign or nonexistent Account cannot mutate authorized financial state').with(['foreign',
    'missing'])
    .run(async ({ client, assert }, target) => {
      const f = await fixture()
      const other = await fixture()
      const before = await snapshot(f)
      const foreign = await snapshot(other)
      const response = await client.post(`/api/v1/account/${target === 'foreign' ? other.account
        .id : 2147483647}/ofx`)
        .unsafeJson(document([{ amount: 10 }])).type('text/plain').loginAs(f.user)
      response.assertStatus(404)
      assert.deepEqual(await snapshot(f), before)
      assert.deepEqual(await snapshot(other), foreign)
    })
})
