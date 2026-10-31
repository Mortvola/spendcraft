import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
import { transactionRequest } from '../../helpers/transactionRequest.js'
import financialAssert from 'node:assert/strict'
import { mock } from 'node:test'
import Category from '#models/Category'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import Transaction from '#models/Transaction'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'
import type { ApiClient } from '@japa/api-client'

let sequence = 0

test.group('OFX reimport financial consistency', () => {
  async function fixture() {
    return db.transaction(async (trx) => {
      const budget = await Budget.create({}, { client: trx })
      await budget.initialize()
      const user = await budget.related('users').create({ username: `ofx-reimport-${++sequence}`,
        email: `ofx-reimport-${sequence}@example.com`, password: 'testPassw0rd' })
      const institution = await budget.related('institutions').create({ name: 'OFX bank' })
      const account = await institution.related('accounts').create({ name: 'OFX card',
        balanceCents: parseMoneyCents('0.00'),
        type: AccountType.Credit, subtype: 'credit card', tracking: TrackingType.Transactions,
        startDate: DateTime.fromISO('2025-02-01'), rate: 0, closed: false })
      const group = await budget.related('groups').create({ name: 'OFX allocations', type:
        'Regular' })
      const first = await group.related('categories').create({ name: 'First', type: CategoryType
        .Regular, balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
      const second = await group.related('categories').create({ name: 'Second', type: CategoryType
        .Regular, balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
      return { budget, user, account, first, second }
    })
  }

  function document(amount: number, date: string, balance: number) {
    return 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n'
      + '<OFX><SIGNONMSGSRSV1><SONRS><FI><FID>123</FI></SONRS></SIGNONMSGSRSV1>'
      + '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>one-account</CCACCTFROM>'
      + `<BANKTRANLIST><STMTTRN><DTPOSTED>${date.replaceAll('-',
        '')}120000[0:GMT]<TRNAMT>${amount}<FITID>one-transaction<NAME>OFX \
movement</STMTTRN></BANKTRANLIST>`
      +
        `<LEDGERBAL><BALAMT>${balance}</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></O\
FX>`
  }

  async function upload(client: ApiClient, f: Awaited<ReturnType<typeof fixture>>, amount = 10,
    date = '2025-02-10', balance = 110) {
    return client.post(`/api/v1/account/${f.account.id}/ofx`).unsafeJson(document(amount, date,
      balance))
      .type('text/plain').accept('json').loginAs(f.user)
  }

  async function state(f: Awaited<ReturnType<typeof fixture>>) {
    const account = await Account.findOrFail(f.account.id)
    const associations = await account.related('accountTransactions').query().orderBy('id').preload(
      'transaction')
    const categories = await db.from('categories').select('categories.*').join('groups',
      'groups.id', 'categories.group_id')
      .where('groups.application_id', f.budget.id).orderBy('categories.id')
    const history = await db.from('balance_histories').where('account_id', account.id).orderBy('id')
    const logs = await db.from('transaction_logs').where('application_id', f.budget.id).orderBy(
      'id')
    const result = { balance: Number(formatMoneyCents(account.balanceCents)),
      plaidBalance: account.plaidBalance, categories,
      history, logs, transactions: associations.map((a) => ({
      id: a.transaction.id, associationId: a.id, providerId: a.providerTransactionId, amount: a
        .amount,
      date: a.transaction.date.toISODate(), deleted: a.transaction.deleted, version: a.transaction
        .version,
      splits: a.transaction.categories, splitTotal: a.transaction.categories.reduce((sum, split) =>
        sum + split.amount, 0),
    })) }
    const totals = new Map<number, number>();
    for (const transaction of result.transactions) {
      financialAssert.equal(transaction.splits.reduce((sum, split) => sum + Math.round(split
        .amount * 100), 0), Math.round(transaction.amount * 100));
      if (!transaction.deleted && transaction.date !== null && transaction.date >= (account
        .startDate.toISODate() ?? '')) {
        for (const split of transaction.splits) totals.set(split.categoryId, (totals.get(split
          .categoryId) ?? 0) + Math.round(split.amount * 100));
      }
    }
    for (const category of categories) financialAssert.equal(Math.round(Number(category.balance) *
      100), totals.get(category.id) ?? 0, `Category ${category
      .name} must match active allocations`);
    return result;
  }

  async function imported(f: Awaited<ReturnType<typeof fixture>>) {
    return f.account.related('accountTransactions').query().where('providerTransactionId',
      '123:one-account:one-transaction').firstOrFail()
  }

  async function categorize(client: ApiClient, f: Awaited<ReturnType<typeof fixture>>,
    multiple: boolean) {
    const association = await imported(f)
    const response = await client.patch(`/api/v1/transaction/${association.transactionId}`).json(
      transactionRequest({ version: (await Transaction.findOrFail(association.transactionId))
      .version, categories: multiple
      ? [{ categoryId: f.first.id, amount: 4, comment: 'Preserve first allocation' }, {
        categoryId: f.second.id, amount: 6, comment: 'Preserve second allocation' }]
      : [{ categoryId: f.first.id, amount: 10, comment: 'Preserve allocation' }] })).accept('json')
        .loginAs(f.user)
    response.assertStatus(200)
  }

  test('OFX reimport preserves canonical tax attribution and numeric/mixed reads reject').with([
    'numeric', 'string', 'mixed'])
    .run(async ({ client, assert }, encoding) => {
      const f = await fixture()
      ;(await upload(client, f)).assertStatus(200)
      const association = await imported(f)
      const taxes = [{ type: 'estimated_tax_payments', amount: encoding === 'numeric' ? 1.005 :
        '1.00', extra: { keep: true } },
        { type: 'estimated_tax_payments', amount: encoding === 'string' ? '-0.12' : -0.125 }]
      await db.from('transactions').where('id', association.transactionId).update({ taxes: JSON
        .stringify(taxes) })
      if (encoding !== 'string') {
        const before = await db.from('transactions').where('id', association.transactionId)
          .firstOrFail()
        const rejected = await client.get(`/api/v1/transaction/${association.transactionId}`)
          .loginAs(f.user)
        rejected.assertStatus(422)
        assert.deepEqual(await db.from('transactions').where('id', association.transactionId)
          .firstOrFail(), before)
        return
      }
      ;(await upload(client, f, 15)).assertStatus(200)
      ;(await upload(client, f, 15)).assertStatus(200)
      assert.deepEqual((await db.from('transactions').where('id', association.transactionId)
        .firstOrFail()).taxes, taxes)
      const response = await client.get(`/api/v1/transaction/${association.transactionId}`).loginAs(
        f.user)
      response.assertStatus(200)
      assert.deepEqual(response.body().taxes.map((tax: { amount: string }) => tax.amount), taxes
        .map(tax => tax.amount))
    })

  test('fractional OFX effects remain exact on import, replay and replacement')
    .with([false, true].flatMap(loan => [1, -1].map(sign => ({ loan, sign }))))
    .run(async ({ client, assert }, { loan, sign }) => {
      const f = await fixture()
      await f.account.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(sign * 0.1)),
        ...(loan ? { type: AccountType.Loan } : {}) }).save()
      const unassigned = await f.budget.getUnassignedCategory()
      await unassigned.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        sign * 0.1)) }).save()
      ;(await upload(client, f, sign * 0.2)).assertStatus(200)
      assert.strictEqual((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(sign * 0.3)))
      await unassigned.refresh()
      assert.strictEqual(unassigned.balanceCents, parseMoneyCents(encodeMonetaryAmount(sign * 0.3)))
      ;(await upload(client, f, sign * 0.2)).assertStatus(200)
      assert.strictEqual((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(sign * 0.3)))
      ;(await upload(client, f, sign * 0.4)).assertStatus(200)
      assert.strictEqual((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(sign * 0.5)))
      await unassigned.refresh()
      assert.strictEqual(unassigned.balanceCents, parseMoneyCents(encodeMonetaryAmount(sign * 0.5)))
    })

  test('first import and identical replay preserve identities and financial effects', async ({
    client, assert }) => {
    const f = await fixture()
    ;(await upload(client, f)).assertStatus(200)
    const before = await state(f)
    ;(await upload(client, f)).assertStatus(200)
    ;(await upload(client, f)).assertStatus(200)
    const after = await state(f)
    console.log(JSON.stringify({ scenario: 'first-and-replay', before, after }))
    assert.deepEqual(after.transactions, before.transactions)
    assert.deepEqual(after.categories, before.categories)
    assert.equal(after.balance, before.balance)
    assert.equal(after.logs.length, before.logs.length)
    const nominal = after.transactions[0].splits[0]
    const categoryReport = await client.get('/api/v1/reports/category').qs({ c: nominal
      .categoryId }).loginAs(f.user)
    categoryReport.assertStatus(200)
    assert.equal(categoryReport.body()[0].sum, nominal.amount)
    assert.equal(categoryReport.body()[0].count, 1)

  })

  test('changed amounts preserve or violate allocations as currently implemented')
    .with([{ allocation: 'unassigned', amount: 15 }, { allocation: 'single', amount: 15 },
      { allocation: 'single', amount: 5 }, { allocation: 'multiple', amount: 15 }, { allocation:
        'single', amount: 0 }, { allocation: 'multiple', amount: 10.01 }, { allocation: 'single',
        amount: -10 }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      ;(await upload(client, f)).assertStatus(200)
      if (scenario.allocation !== 'unassigned') await categorize(client, f, scenario.allocation ===
        'multiple')
      const before = await state(f)
      const identity = await imported(f)
      ;(await upload(client, f, scenario.amount, '2025-02-10', 100 + scenario.amount)).assertStatus(
        200)
      const after = await state(f)
      const unassignedId = before.categories.find((category) => category.name === 'Unassigned')?.id;
      const previous = before.transactions.find((transaction) => transaction.id === identity
        .transactionId);
      const updated = after.transactions.find((transaction) => transaction.id === identity
        .transactionId);
      assert.deepEqual(updated?.splits.filter((split) => split.categoryId !== unassignedId),
        previous?.splits.filter((split) => split.categoryId !== unassignedId));
      assert.equal(updated?.amount, scenario.amount);
      assert.equal(after.balance, scenario.amount);
      assert.equal(after.plaidBalance, 100 + scenario.amount);
      ;(await upload(client, f, scenario.amount, '2025-02-10', 100 + scenario.amount)).assertStatus(
        200)
      ;(await upload(client, f, scenario.amount, '2025-02-10', 100 + scenario.amount)).assertStatus(
        200)
      const replay = await state(f)
      assert.deepEqual(replay.transactions, after.transactions)
      assert.deepEqual(replay.categories, after.categories)
      assert.equal(replay.balance, after.balance)
      assert.deepEqual(replay.logs, after.logs)
      assert.equal(replay.history.length, after.history.length)
      console.log(JSON.stringify({ scenario, before, after }))
      assert.equal((await imported(f)).id, identity.id)
      assert.equal((await imported(f)).transactionId, identity.transactionId)
    })

  test('deleted transactions are reimported with their persisted allocations')
    .with(['unassigned', 'single', 'multiple', 'single-changed']).run(async ({ client, assert },
      allocation) => {
      const f = await fixture()
      ;(await upload(client, f)).assertStatus(200)
      if (allocation !== 'unassigned') await categorize(client, f, allocation === 'multiple')
      const identity = await imported(f)
      const deletion = await client.delete(`/api/v1/transaction/${identity.transactionId}`).accept(
        'json').loginAs(f.user)
      deletion.assertStatus(200)
      const before = await state(f)
      ;(await upload(client, f, allocation === 'single-changed' ? 15 : 10, '2025-02-10',
        allocation === 'single-changed' ? 115 : 110)).assertStatus(200)
      const after = await state(f)
      console.log(JSON.stringify({ scenario: `restore-${allocation}`, before, after }))
      assert.equal((await imported(f)).id, identity.id)
      assert.isFalse((await Transaction.findOrFail(identity.transactionId)).deleted)
    })

  test('date replay characterizes start-date crossings with and without amount changes')
    .with([{ before: '2025-01-20', after: '2025-02-01', amount: 10 },
      { before: '2025-02-10', after: '2025-01-20', amount: 10 },
      { before: '2025-02-10', after: '2025-02-11', amount: 10 },
      { before: '2025-01-20', after: '2025-02-01', amount: 15 },
      { before: '2025-01-20', after: '2025-02-10', amount: 10 },
      { before: '2025-01-20', after: '2025-01-21', amount: 10 }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      ;(await upload(client, f, 10, scenario.before)).assertStatus(200)
      const before = await state(f)
      const identity = await imported(f)
      ;(await upload(client, f, scenario.amount, scenario.after, 100 + scenario.amount))
        .assertStatus(200)
      const after = await state(f)
      console.log(JSON.stringify({ scenario, before, after }))
      assert.equal((await imported(f)).transactionId, identity.transactionId)
      assert.equal(after.balance, scenario.after >= '2025-02-01' ? scenario.amount : 0)
    })

  test('late Pool persistence failure rolls back accounting, provider and full import state',
    async ({ client, assert }) => {
    const f = await fixture()
    ;(await upload(client, f)).assertStatus(200)
    await categorize(client, f, true)
    const before = await state(f)
    const pool = await f.budget.getFundingPoolCategory()
    const save = Category.prototype.save
    const failure = mock.method(Category.prototype, 'save', async function (this: Category) {
      if (this.id === pool.id) throw new Error('Injected late Pool persistence failure')
      return save.call(this)
    })
    try {
      ;(await upload(client, f, 15, '2025-02-11', 115)).assertStatus(500)
      assert.deepEqual(await state(f), before)
    } finally { failure.mock.restore() }
  })
})
