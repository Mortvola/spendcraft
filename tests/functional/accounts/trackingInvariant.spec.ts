import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Category from '#models/Category'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const investmentData = { shortTermCapitalGains: 1, longTermCapitalGains: 2, dividends: 3, taxableInterest: 4 }

async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `invariant-${++sequence}`, email: `invariant-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Invariant bank' })
    const account = await institution.related('accounts').create({
      name: 'Invariant account', balance: 100, type: AccountType.Investment, subtype: 'IRA',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    return { budget, user, account }
  })
}

test.group('Balance-tracked invariant enforcement', (group) => {
  let f: Awaited<ReturnType<typeof createFixture>>
  let category: Category
  group.each.setup(async () => {
    f = await createFixture()
    await f.account.merge({ tracking: TrackingType.Balances }).save()
    await f.account.related('statements').create({ startDate: DateTime.fromISO('2025-01-01'), endDate: DateTime.fromISO('2025-01-31'), startingBalance: 0, endingBalance: 100, data: investmentData })
    const owner = await f.budget.related('groups').create({ name: 'Invariant categories', type: 'Regular' })
    category = await owner.related('categories').create({ name: 'Explicit allocation', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
  })

  async function snapshot() {
    return Promise.all([
      db.from('accounts').where('id', f.account.id),
      db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', f.account.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id'),
      db.from('statements').where('account_id', f.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', f.budget.id).orderBy('id'),
    ])
  }

  // Before enforcement these requests succeeded and created invalid financial state.
  test('API rejects transaction creation on a Statement-backed balance-tracked account')
    .with([
      { shape: 'categorized', amount: 10 }, { shape: 'categorized', amount: -10 },
      { shape: 'categorized', amount: 0 }, { shape: 'empty', amount: 10 }, { shape: 'split', amount: 10 },
    ]).run(async ({ client, assert }, scenario) => {
      const unassigned = await f.budget.getUnassignedCategory()
      const categories = scenario.shape === 'empty' ? [] : scenario.shape === 'split'
        ? [{ categoryId: category.id, amount: 3.25 }, { categoryId: unassigned.id, amount: 6.75 }]
        : [{ categoryId: category.id, amount: scenario.amount }]
      const before = await snapshot()
      const response = await client.post(`/api/v1/account/${f.account.id}/transactions`)
        .json({ date: '2025-02-10', name: 'Invalid balance-tracked creation', amount: scenario.amount, categories })
        .accept('json').loginAs(f.user)
      response.assertStatus(422)
      assert.deepEqual(await snapshot(), before)
    })

  test('PATCH rejects historical invalid transaction mutation', async ({ client, assert }) => {
    const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO('2025-02-10'), type: TransactionType.MANUAL_TRANSACTION, version: 0, deleted: false, sortOrder: 0, categories: [{ categoryId: category.id, amount: 10 }], taxes: [] })
    await f.account.related('accountTransactions').create({ transactionId: transaction.id, amount: 10, name: 'Historical invalid row', pending: false, provider: 'NONE' })
    await category.merge({ balance: 10 }).save()
    const before = await snapshot()
    const response = await client.patch(`/api/v1/transaction/${transaction.id}`).json({ version: 0, amount: 20, categories: [{ categoryId: category.id, amount: 20 }] }).accept('json').loginAs(f.user)
    response.assertStatus(422)
    assert.deepEqual(await snapshot(), before)
  })

  test('transaction-to-balance conversion rejects with zero or existing transactions, with or without a date edit')
    .with([{ existing: false, date: false }, { existing: false, date: true }, { existing: true, date: false }, { existing: true, date: true }])
    .run(async ({ client, assert }, scenario) => {
      await f.account.merge({ tracking: TrackingType.Transactions }).save()
      if (scenario.existing) {
        const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO('2025-02-10'), type: TransactionType.MANUAL_TRANSACTION, version: 0, deleted: false, sortOrder: 0, categories: [], taxes: [] })
        await f.account.related('accountTransactions').create({ transactionId: transaction.id, amount: 0, name: 'Existing', pending: false, provider: 'NONE' })
      }
      const before = await snapshot()
      const response = await client.patch(`/api/v1/account/${f.account.id}`)
        .json({ tracking: TrackingType.Balances, ...(scenario.date ? { startDate: '2025-02-01' } : {}) }).accept('json').loginAs(f.user)
      response.assertStatus(422)
      assert.deepEqual(await snapshot(), before)
    })

  test('shared Initial Funding rejects creation and preserves historical records')
    .with([false, true]).run(async ({ assert }, historical) => {
      if (historical) {
        const funding = await f.budget.getFundingPoolCategory()
        const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO('2025-01-01'), type: TransactionType.STARTING_BALANCE, version: 0, sortOrder: -1, categories: [{ categoryId: funding.id, amount: 100 }], taxes: [] })
        await f.account.related('accountTransactions').create({ transactionId: transaction.id, amount: 100, name: 'Historical Initial Funding', provider: 'NONE' })
      }
      const before = await snapshot()
      await assert.rejects(() => db.transaction(async (trx) => {
        f.account.useTransaction(trx)
        const funding = await f.budget.getFundingPoolCategory({ client: trx })
        await f.account.updateStartingBalance(f.budget, funding)
      }), /Initial Funding/)
      assert.deepEqual(await snapshot(), before)
    })

  test('OFX model workflow rejects before financial mutation', async ({ assert }) => {
    const ofx = 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n'
      + '<OFX><SIGNONMSGSRSV1><SONRS><FI><FID>123</FI></SONRS></SIGNONMSGSRSV1>'
      + '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>test</CCACCTFROM>'
      + '<BANKTRANLIST><STMTTRN><DTPOSTED>20250210120000[0:GMT]<TRNAMT>10<FITID>test-movement<NAME>Test movement</STMTTRN></BANKTRANLIST>'
      + '<LEDGERBAL><BALAMT>200</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>'
    const before = await snapshot()
    await assert.rejects(() => db.transaction(async (trx) => {
      f.account.useTransaction(trx)
      await f.account.processOfx(ofx, f.budget, f.user)
    }), /OFX/)
    assert.deepEqual(await snapshot(), before)
  })
  test('historical invalid DELETE rejects without reversing or repairing anything', async ({ client, assert }) => {
    const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO('2025-02-10'), type: TransactionType.MANUAL_TRANSACTION, version: 0, deleted: false, sortOrder: 0, categories: [{ categoryId: category.id, amount: 10 }], taxes: [] })
    await f.account.related('accountTransactions').create({ transactionId: transaction.id, amount: 10, name: 'Historical invalid delete', pending: false, provider: 'NONE' })
    await category.merge({ balance: 10 }).save()
    const before = await snapshot()
    const response = await client.delete(`/api/v1/transaction/${transaction.id}`).accept('json').loginAs(f.user)
    response.assertStatus(422)
    assert.deepEqual(await snapshot(), before)
  })

  test('HTTP OFX rejects before parsing or mutation', async ({ client, assert }) => {
    const before = await snapshot()
    const response = await client.post(`/api/v1/account/${f.account.id}/ofx`).accept('json').loginAs(f.user)
    response.assertStatus(422)
    assert.deepEqual(await snapshot(), before)
  })
})
