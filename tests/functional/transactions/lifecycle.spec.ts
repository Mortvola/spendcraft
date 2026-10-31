import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
import { transactionRequest } from '../../helpers/transactionRequest.js'
import {
  writeCanonicalTransactionFixture, writeHistoricalTransactionFixture,
} from '../../helpers/historicalTransactionFixture.js'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import AccountTransaction from '#models/AccountTransaction'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `lifecycle-${++sequence}`, email: `lifecycle-${sequence}@example.com`, password:
        'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Lifecycle bank' })
    const account = await institution.related('accounts').create({
      name: 'Lifecycle account', balanceCents: parseMoneyCents('110.00'),
        type: AccountType.Depository, subtype: 'checking',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0,
        closed: false,
    })
    const group = await budget.related('groups').create({ name: 'Lifecycle group', type:
      'Regular' })
    const first = await group.related('categories').create({ name: 'First', type: CategoryType
      .Regular, balanceCents: parseMoneyCents('10.00'), fundingCategories: [] })
    const second = await group.related('categories').create({ name: 'Second', type: CategoryType
      .Regular, balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, categories: [{ categoryId: first.id, amount: 10 }],
        taxes: [],
    })
    await writeCanonicalTransactionFixture(transaction)
    const accountTransaction = await account.related('accountTransactions').create({
      transactionId: transaction.id, name: 'Original purchase', amount: 10, pending: false,
        provider: 'NONE', statementId: null,
    })
    return { budget, user, account, first, second, transaction, accountTransaction }
  })
}

test.group('Ordinary transaction lifecycle', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function snapshot() {
    return Promise.all([
      db.from('transactions').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', fixture.account.id).orderBy('id'),
      db.from('accounts').where('id', fixture.account.id),
      db.from('categories').select('categories.*').join('groups', 'groups.id',
        'categories.group_id')
        .where('groups.application_id', fixture.budget.id).orderBy('categories.id'),
      db.from('statements').where('account_id', fixture.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', fixture.budget.id).orderBy('id'),
    ])
  }

  test('CREATE and DELETE retain exact fractional Account, Category and Unassigned balances')
    .with(['explicit', 'duplicates', 'unassigned', 'negative'])
    .run(async ({ client, assert }, mode) => {
      const category = mode === 'unassigned' ? await fixture.budget.getUnassignedCategory()
        : fixture.first
      const negative = mode === 'negative'
      const initial = negative ? -0.1 : 0.1
      await category.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(initial)) }).save()
      await fixture.account.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        initial)) }).save()
      const accountBefore = Number(formatMoneyCents((await Account.findOrFail(
        fixture.account.id)).balanceCents))
      const categories = mode === 'unassigned' ? [] : mode === 'duplicates'
        ? [{ categoryId: category.id, amount: '0.10' }, { categoryId: category.id, amount: '0.10' }]
        : [{ categoryId: category.id, amount: negative ? '-0.20' : '0.20' }]
      const created = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
        .json({ date: '2025-03-01', name: 'Exact Category roundtrip',
          amount: negative ? '-0.20' : '0.20', categories }).accept('json').loginAs(fixture.user)
      created.assertStatus(200)
      assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(negative ? -0.3 : 0.3)))
      assert.strictEqual(created.body().acctBalances[0].balance, negative ? '-0.30' : '0.30')
      assert.strictEqual((await Category.findOrFail(category.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(negative ? -0.3 : 0.3)))
      assert.strictEqual(created.body().categories.find((row: { id: number }) => row.id ===
        category.id).balance, negative ? '-0.30' : '0.30')
      const id = created.body().transaction.id
      const removed = await client.delete(`/api/v1/transaction/${id}`).accept('json')
        .loginAs(fixture.user)
      removed.assertStatus(200)
      assert.strictEqual((await Category.findOrFail(category.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(initial)))
      assert.strictEqual(removed.body().data.categories.find((row: { id: number }) => row.id ===
        category.id).balance, negative ? '-0.10' : '0.10')
      assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(accountBefore)))
      assert.strictEqual(removed.body().data.acctBalances[0].balance, negative ? '-0.10' : '0.10')
      assert.isTrue((await Transaction.findOrFail(id)).deleted)
    })

  test('PATCH Account effects retain exact positive and negative cents').with([false, true])
    .run(async ({ client, assert }, negative) => {
      const sign = negative ? -1 : 1
      await db.transaction(async trx => {
        await Budget.query({ client: trx }).where('id', fixture.budget.id).forUpdate().firstOrFail()
        const transaction = await Transaction.query({ client: trx }).where('id', fixture.transaction
          .id).firstOrFail()
        await transaction.merge({ categories: [{ categoryId: fixture.first.id,
          amount: sign * 0.2 }] }).save()
        await fixture.accountTransaction.useTransaction(trx).merge({ amount: sign * 0.2 }).save()
        await fixture.account.useTransaction(trx).merge({ balanceCents: parseMoneyCents(
          encodeMonetaryAmount(sign * 0.1)) }).save()
        await fixture.first.useTransaction(trx).merge({ balanceCents: parseMoneyCents(
          encodeMonetaryAmount(sign * 0.2)) }).save()
      })
      for (const [version, amount] of [negative ? '-0.40' : '0.40',
        negative ? '-0.20' : '0.20'].entries()) {
        const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
          .json({ version, amount, categories: [{ categoryId: fixture.first.id, amount }] })
          .accept('json').loginAs(fixture.user)
        response.assertStatus(200)
        const expected = version === 0 ? 0.3 : 0.1
        assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
          parseMoneyCents(encodeMonetaryAmount(sign * expected)))
        assert.strictEqual(response.body().data.acctBalances[0].balance,
          `${negative ? '-' : ''}${version === 0 ? '0.30' : '0.10'}`)
      }
    })

  test('PATCH equivalent decimal partitions skip Category and Account writes', async ({ client,
    assert }) => {
    const id = fixture.first.id
    await db.transaction(async trx => {
      await Budget.query({ client: trx }).where('id', fixture.budget.id).forUpdate().firstOrFail()
      const transaction = await Transaction.query({ client: trx }).where('id', fixture.transaction
        .id).firstOrFail()
      await transaction.merge({ categories: [{ categoryId: id, amount: 0.1 },
        { categoryId: id, amount: 0.2 }] }).save()
      await fixture.accountTransaction.useTransaction(trx).merge({ amount: 0.3 }).save()
      await fixture.account.useTransaction(trx).merge({ balanceCents: parseMoneyCents(
        '100.30') }).save()
      await fixture.first.useTransaction(trx).merge({ balanceCents: parseMoneyCents(
        '0.30') }).save()
    })
    const categoryBefore = await db.from('categories').where('id', id).firstOrFail()
    const accountBefore = await db.from('accounts').where('id', fixture.account.id).firstOrFail()
    const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
      .json({ version: 0, categories: [{ categoryId: id, amount: '0.30' }] })
      .accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.deepEqual(response.body().data.categories, [])
    assert.deepEqual(await db.from('categories').where('id', id).firstOrFail(), categoryBefore)
    assert.deepEqual(await db.from('accounts').where('id', fixture.account.id).firstOrFail(),
      accountBefore)
    assert.deepEqual((await Transaction.findOrFail(fixture.transaction.id)).categories,
      [{ categoryId: id, amount: 0.3 }])
  })

  test('PATCH moves exact cents while preserving duplicate nominal allocations', async ({ client,
    assert }) => {
    await db.transaction(async trx => {
      await Budget.query({ client: trx }).where('id', fixture.budget.id).forUpdate().firstOrFail()
      const transaction = await Transaction.query({ client: trx }).where('id', fixture.transaction
        .id).firstOrFail()
      await transaction.merge({ categories: [
        { categoryId: fixture.first.id, amount: 0.1 },
        { categoryId: fixture.second.id, amount: 0.2 },
      ] }).save()
      await fixture.accountTransaction.useTransaction(trx).merge({ amount: 0.3 }).save()
      await fixture.first.useTransaction(trx).merge({ balanceCents: parseMoneyCents(
        '0.10') }).save()
      await fixture.second.useTransaction(trx).merge({ balanceCents: parseMoneyCents(
        '0.20') }).save()
    })
    const accountBefore = await db.from('accounts').where('id', fixture.account.id).firstOrFail()
    const categories = [{ categoryId: fixture.first.id, amount: '0.10' },
      { categoryId: fixture.first.id, amount: '0.20' }]
    const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
      .json({ version: 0, categories }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.strictEqual((await Category.findOrFail(fixture.first.id)).balanceCents,
      parseMoneyCents('0.30'))
    assert.strictEqual((await Category.findOrFail(fixture.second.id)).balanceCents,
      parseMoneyCents('0.00'))
    const raw = await db.from('transactions').where('id', fixture.transaction.id).firstOrFail()
    assert.deepEqual(raw.categories, categories)
    assert.deepEqual(await db.from('accounts').where('id', fixture.account.id).firstOrFail(),
      accountBefore)
  })

  test('special Account-linked PATCH and DELETE retain exact balances and existing pending rules')
    .with([TransactionType.STARTING_BALANCE, TransactionType.TRANSFER_TRANSACTION]
      .flatMap(type => [1, -1].flatMap(sign => [false, true].map(pending => ({ type, sign,
        pending })))))
    .run(async ({ client, assert }, { type, sign, pending }) => {
      await fixture.account.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        sign * 0.1)) }).save()
      await fixture.first.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        sign * 0.2)) }).save()
      await fixture.accountTransaction.merge({ amount: sign * 0.2, pending }).save()
      await writeHistoricalTransactionFixture(fixture.transaction, { type, categories: [
        { categoryId: fixture.first.id, amount: type === TransactionType.TRANSFER_TRANSACTION
          ? sign * 0.2 : sign > 0 ? '0.20' : '-0.20' }] })
      for (const [version, value] of ['0.40', '0.20'].entries()) {
        const amount = sign < 0 ? `-${value}` : value
        const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
          .json({ version, amount, categories: [{ categoryId: fixture.first.id, amount }] })
          .loginAs(fixture.user)
        response.assertStatus(200)
        assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
          parseMoneyCents(encodeMonetaryAmount(sign * (version === 0 ? 0.3 : 0.1))))
        assert.strictEqual(response.body().data.acctBalances[0].balance,
          sign < 0 ? (version === 0 ? '-0.30' : '-0.10') : (version === 0 ? '0.30' : '0.10'))
      }
      const metadata = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
        .json({ version: 2, name: 'Renamed special entry' }).loginAs(fixture.user)
      metadata.assertStatus(200)
      assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(sign * 0.1)))
      const stored = await db.from('transactions').where('id', fixture.transaction.id).firstOrFail()
      assert.strictEqual(typeof stored.categories[0].amount,
        type === TransactionType.TRANSFER_TRANSACTION ? 'number' : 'string')
      const removed = await client.delete(`/api/v1/transaction/${fixture.transaction.id}`)
        .loginAs(fixture.user)
      removed.assertStatus(200)
      assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(pending ? sign * 0.1 : -sign * 0.1)))
      assert.strictEqual((await Category.findOrFail(fixture.second.id)).balanceCents,
        parseMoneyCents('0.00'))
    })

  test('special Account-linked balance overflow rolls back the full mutation')
    .with(['patch', 'delete']).run(async ({ client, assert }, operation) => {
      await fixture.account.merge({ balanceCents: parseMoneyCents('9999999999.99') }).save()
      await fixture.accountTransaction.merge({ amount: -0.01 }).save()
      await writeHistoricalTransactionFixture(fixture.transaction, {
        type: TransactionType.STARTING_BALANCE, categories: [
          { categoryId: fixture.first.id, amount: '-0.01' }] })
      const before = await snapshot()
      const response = operation === 'patch'
        ? await client.patch(`/api/v1/transaction/${fixture.transaction.id}`).json({ version: 0,
          amount: '0.00', categories: [{ categoryId: fixture.first.id, amount: '0.00' }] })
          .loginAs(fixture.user)
        : await client.delete(`/api/v1/transaction/${fixture.transaction.id}`).loginAs(fixture.user)
      response.assertStatus(500)
      assert.deepEqual(await snapshot(), before)
    })

  test('Loan Accounts and legacy Category types use strings and preserve lifecycle balances')
    .with(['account', 'category'].flatMap(exclusion => [1, -1].map(sign => ({ exclusion, sign }))))
    .run(async ({ client, assert }, { exclusion, sign }) => {
      await fixture.account.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(sign * 0.1)),
        ...(exclusion === 'account' ? { type: AccountType.Loan } : {}) }).save()
      await fixture.first.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(sign * 0.1)),
        ...(exclusion === 'category' ? { type: CategoryType.Loan } : {}) }).save()
      const amount = sign > 0 ? '0.20' : '-0.20'
      const created = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
        .json({ date: '2025-03-01', name: 'Exact excluded split', amount, principle: '0.00',
          categories: [{ categoryId: fixture.first.id, amount: sign > 0 ? '0.10' : '-0.10' },
            { categoryId: fixture.first.id, amount: sign > 0 ? '0.10' : '-0.10' }] })
        .loginAs(fixture.user)
      created.assertStatus(200)
      const id: number = created.body().transaction.id
      assert.strictEqual((await Category.findOrFail(fixture.first.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(sign * 0.3)))
      for (const [version, value] of ['0.40', '0.20'].entries()) {
        const split = version === 0 ? '0.20' : '0.10'
        const response = await client.patch(`/api/v1/transaction/${id}`).json({ version,
          amount: sign < 0 ? `-${value}` : value, categories: [
            { categoryId: fixture.first.id, amount: sign < 0 ? `-${split}` : split },
            { categoryId: fixture.first.id, amount: sign < 0 ? `-${split}` : split }] })
          .loginAs(fixture.user)
        response.assertStatus(200)
        assert.strictEqual((await Category.findOrFail(fixture.first.id)).balanceCents,
          parseMoneyCents(encodeMonetaryAmount(sign * (version === 0 ? 0.5 : 0.3))))
      }
      const stored = await db.from('transactions').where('id', id).firstOrFail()
      assert.isTrue(stored.categories.every((split: { amount: unknown }) => typeof split.amount ===
        'string'))
      const metadata = await client.patch(`/api/v1/transaction/${id}`)
        .json({ version: 2, name: 'Excluded metadata update' }).loginAs(fixture.user)
      metadata.assertStatus(200)
      assert.deepEqual((await db.from('transactions').where('id', id).firstOrFail()).categories,
        stored.categories)
      ;(await client.delete(`/api/v1/transaction/${id}`).loginAs(fixture.user)).assertStatus(200)
      assert.strictEqual((await Category.findOrFail(fixture.first.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(sign * 0.1)))
      assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(sign * 0.1)))
      assert.strictEqual((await Category.findOrFail(fixture.second.id)).balanceCents,
        parseMoneyCents('0.00'))
    })

  test('Loan-excluded empty allocations preserve exact Unassigned fallback effects', async ({
    client, assert }) => {
    await fixture.account.merge({ type: AccountType.Loan }).save()
    const unassigned = await fixture.budget.getUnassignedCategory()
    await unassigned.merge({ balanceCents: parseMoneyCents('0.10') }).save()
    const created = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
      .json({ date: '2025-03-01', name: 'Empty excluded', amount: '0.20', principle: '0.00',
        categories: [] }).loginAs(fixture.user)
    created.assertStatus(200)
    const id: number = created.body().transaction.id
    assert.strictEqual((await Category.findOrFail(unassigned.id)).balanceCents, parseMoneyCents(
      '0.30'))
    await db.from('transactions').where('id', id).update({ categories: '[]' })
    const metadata = await client.patch(`/api/v1/transaction/${id}`)
      .json({ version: 0, name: 'Preserve empty history' }).loginAs(fixture.user)
    metadata.assertStatus(200)
    assert.deepEqual((await db.from('transactions').where('id', id).firstOrFail()).categories, [])
    const patched = await client.patch(`/api/v1/transaction/${id}`)
      .json({ version: 1, amount: '0.40', categories: [] }).loginAs(fixture.user)
    patched.assertStatus(200)
    assert.strictEqual((await Category.findOrFail(unassigned.id)).balanceCents, parseMoneyCents(
      '0.50'))
    await db.from('transactions').where('id', id).update({ categories: '[]' })
    ;(await client.delete(`/api/v1/transaction/${id}`).loginAs(fixture.user)).assertStatus(200)
    assert.strictEqual((await Category.findOrFail(unassigned.id)).balanceCents, parseMoneyCents(
      '0.10'))
  })

  test('Loan-excluded Category overflow rolls back the entire mutation')
    .with(['create', 'patch', 'delete']).run(async ({ client, assert }, operation) => {
      await fixture.account.merge({ type: AccountType.Loan }).save()
      await fixture.first.merge({ balanceCents: parseMoneyCents('9999999999.99') }).save()
      await fixture.accountTransaction.merge({ amount: operation === 'delete' ? -0.01 : 0.2,
        principle: 0 }).save()
      await writeHistoricalTransactionFixture(fixture.transaction, { categories: [
        { categoryId: fixture.first.id, amount: operation === 'delete' ? '-0.01' : '0.20' }] })
      const before = await snapshot()
      const response = operation === 'create'
        ? await client.post(`/api/v1/account/${fixture.account.id}/transactions`).json({
          date: '2025-03-01', name: 'Excluded overflow', amount: '0.01', principle: '0.00',
          categories: [{ categoryId: fixture.first.id, amount: '0.01' }] }).loginAs(fixture.user)
        : operation === 'patch'
          ? await client.patch(`/api/v1/transaction/${fixture.transaction.id}`).json({ version: 0,
            amount: '0.30', categories: [{ categoryId: fixture.first.id, amount: '0.30' }] })
            .loginAs(fixture.user)
          : await client.delete(`/api/v1/transaction/${fixture.transaction.id}`)
            .loginAs(fixture.user)
      response.assertStatus(500)
      assert.deepEqual(await snapshot(), before)
    })

  test('Loan principal CREATE PATCH DELETE preserve exact signed balances and canonical JSON')
    .with([1, -1]).run(async ({ client, assert }, sign) => {
      await fixture.account.merge({ type: AccountType.Loan, balanceCents: parseMoneyCents(
        encodeMonetaryAmount(sign * 0.1)) }).save()
      const created = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
        .json({ date: '2025-03-01', name: 'Exact Loan payment',
          amount: sign > 0 ? '0.30' : '-0.30', principle: sign > 0 ? '0.20' : '-0.20',
          categories: [] }).loginAs(fixture.user)
      created.assertStatus(200)
      const id: number = created.body().transaction.id
      assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(sign * 0.3)))
      const stored = await db.from('transactions').where('id', id).firstOrFail()
      assert.isTrue(stored.categories.every((split: { amount: unknown }) => typeof split.amount ===
        'string'))
      for (const [version, principle] of ['0.10', '0.20'].entries()) {
        const response = await client.patch(`/api/v1/transaction/${id}`).json({ version,
          principle: sign < 0 ? `-${principle}` : principle }).loginAs(fixture.user)
        response.assertStatus(200)
        assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
          parseMoneyCents(encodeMonetaryAmount(sign * (version === 0 ? 0.2 : 0.3))))
        assert.strictEqual(response.body().data.transaction.accountTransaction.principle,
          sign < 0 ? `-${principle}` : principle)
        assert.deepEqual((await db.from('transactions').where('id', id).firstOrFail()).categories,
          stored.categories)
      }
      const removed = await client.delete(`/api/v1/transaction/${id}`).loginAs(fixture.user)
      removed.assertStatus(200)
      assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
        parseMoneyCents(encodeMonetaryAmount(sign * 0.1)))
      assert.strictEqual(removed.body().data.acctBalances[0].balance,
        sign < 0 ? '-0.10' : '0.10')
      assert.strictEqual((await Category.findOrFail(fixture.first.id)).balanceCents,
        parseMoneyCents('10.00'))
    })

  test('Loan principal balance overflow rolls back the complete mutation')
    .with(['create', 'patch', 'delete']).run(async ({ client, assert }, operation) => {
      await fixture.account.merge({ type: AccountType.Loan, balanceCents: parseMoneyCents(
        '9999999999.99') }).save()
      await fixture.accountTransaction.merge({ principle: operation === 'delete' ? -0.01 : 0 })
        .save()
      await writeHistoricalTransactionFixture(fixture.transaction, { categories: [
        { categoryId: fixture.first.id, amount: '10.00' }] })
      const before = await snapshot()
      const response = operation === 'create'
        ? await client.post(`/api/v1/account/${fixture.account.id}/transactions`).json({
          date: '2025-03-01', name: 'Overflow Loan', amount: '0.01', principle: '0.01',
          categories: [] }).loginAs(fixture.user)
        : operation === 'patch'
          ? await client.patch(`/api/v1/transaction/${fixture.transaction.id}`).json({ version: 0,
            principle: '0.01' }).loginAs(fixture.user)
          : await client.delete(`/api/v1/transaction/${fixture.transaction.id}`)
            .loginAs(fixture.user)
      response.assertStatus(500)
      assert.deepEqual(await snapshot(), before)
    })

  test('Loan CREATE and PATCH decode canonical principal and preserve numeric models', async ({
    client, assert }) => {
    await fixture.account.merge({ type: AccountType.Loan }).save()
    const created = await client.post(`/api/v1/account/${fixture.account.id}/transactions`).json({
      date: '2025-03-01', name: 'Loan payment', amount: '12.35', principle: '10.25', categories: [],
    }).accept('json').loginAs(fixture.user)
    created.assertStatus(200)
    const id = created.body().transaction.id
    let model = await AccountTransaction.findByOrFail('transactionId', id)
    assert.strictEqual(model.amount, 12.35)
    assert.strictEqual(model.principle, 10.25)
    assert.strictEqual(created.body().transaction.accountTransaction.principle, '10.25')
    assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
      parseMoneyCents('120.25'))
    const updated = await client.patch(`/api/v1/transaction/${id}`).json({
      version: 0, amount: '-0.12', principle: '-0.12',
    }).accept('json').loginAs(fixture.user)
    updated.assertStatus(200)
    model = await AccountTransaction.findByOrFail('transactionId', id)
    assert.strictEqual(model.amount, -0.12)
    assert.strictEqual(model.principle, -0.12)
    assert.strictEqual(updated.body().data.transaction.accountTransaction.principle, '-0.12')
    assert.strictEqual((await Account.findOrFail(fixture.account.id)).balanceCents,
      parseMoneyCents('109.88'))
    assert.strictEqual((await Category.findOrFail(fixture.first.id)).balanceCents,
      parseMoneyCents('10.00'))
  })

  test('CREATE and PATCH reject noncanonical money before financial mutation').with([
    1, '1.005', '1e2', '-0.00', '90071992547409.92',
  ]).run(async ({ client, assert }, amount) => {
    const before = await snapshot()
    for (const operation of ['create', 'patch']) {
      for (const field of ['amount', 'principle', 'categories', ...(operation === 'patch' ? [
        'taxCategories'] : [])]) {
        const payload: Record<string, unknown> = operation === 'create'
          ? { date: '2025-03-01', name: 'Invalid request', amount: '1.00', categories: [{
            categoryId: fixture.first.id, amount: '1.00' }] }
          : { version: 0 }
        payload[field] = field === 'categories' ? [{ categoryId: fixture.first.id, amount }]
          : field === 'taxCategories' ? [{ type: 'estimated_tax_payments', amount }] : amount
        const request = operation === 'create' ? client.post(`/api/v1/account/${fixture.account
          .id}/transactions`)
          : client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
        const response = await request.json(payload).accept('json').loginAs(fixture.user)
        response.assertStatus(422)
        assert.deepEqual(await snapshot(), before)
      }
    }
  })

  test('creation applies signed one-category/multi-split amounts').with(['single', 'multiple',
    'negative', 'zero']).run(async ({ client, assert }, scenario) => {
    const amount = scenario === 'negative' ? -20 : scenario === 'zero' ? 0 : 20
    const categories = scenario === 'multiple'
      ? [{ categoryId: fixture.first.id, amount: 7 }, { categoryId: fixture.second.id, amount: 13 }]
      : [{ categoryId: fixture.first.id, amount }]
    const response = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
      .json(transactionRequest({ date: '2025-03-01', name: 'Created purchase', amount,
        categories })).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(response.body().transaction.id)
    const accountTransaction = await AccountTransaction.findByOrFail('transactionId', transaction
      .id)
    assert.deepEqual(transaction.categories, categories)
    assert.equal(accountTransaction.amount, amount)
    assert.equal(accountTransaction.accountId, fixture.account.id)
    assert.equal(transaction.budgetId, fixture.budget.id)
    assert.equal((await Account.findOrFail(fixture.account.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(110 + amount)))
    assert.equal((await Category.findOrFail(fixture.first.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(10 + categories[0].amount)))
    assert.equal((await Category.findOrFail(fixture.second.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(scenario ===
      'multiple' ? 13 : 0)))
  })

  test('updates reverse old splits and apply replacement state').with(['amount', 'category',
    'single-to-multiple', 'multiple-to-single', 'metadata', 'date']).run(async ({ client, assert },
    scenario) => {
    if (scenario === 'multiple-to-single') {
      await writeHistoricalTransactionFixture(fixture.transaction, { categories: [{
        categoryId: fixture.first.id, amount: 4 }, { categoryId: fixture.second.id, amount: 6 }] })
      await writeCanonicalTransactionFixture(fixture.transaction)
      await fixture.first.merge({ balanceCents: parseMoneyCents('4.00') }).save()
      await fixture.second.merge({ balanceCents: parseMoneyCents('6.00') }).save()
    }
    const amount = scenario === 'amount' ? 25 : 10
    const categories = scenario === 'category' || scenario === 'multiple-to-single'
      ? [{ categoryId: fixture.second.id, amount }]
      : scenario === 'single-to-multiple'
        ? [{ categoryId: fixture.first.id, amount: 4 }, { categoryId: fixture.second.id,
          amount: 6 }]
        : [{ categoryId: fixture.first.id, amount }]
    const payload = scenario === 'metadata' ? { name: 'New payee', comment: 'New description' }
      : scenario === 'date' ? { date: '2025-03-01' } : { amount, categories }
    const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
      .json(transactionRequest({ version: 0, ...payload })).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(fixture.transaction.id)
    const accountTransaction = await AccountTransaction.findOrFail(fixture.accountTransaction.id)
    assert.equal(transaction.version, 1)
    assert.deepEqual(transaction.categories, categories)
    assert.equal(accountTransaction.amount, amount)
    assert.equal((await Account.findOrFail(fixture.account.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(100 + amount)))
    assert.equal((await Category.findOrFail(fixture.first.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(categories.filter((c) => c
      .categoryId === fixture.first.id).reduce((sum, c) => sum + c.amount, 0))))
    assert.equal((await Category.findOrFail(fixture.second.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(categories.filter((c) => c
      .categoryId === fixture.second.id).reduce((sum, c) => sum + c.amount, 0))))
    if (scenario === 'date') assert.equal(transaction.date.toISODate(), '2025-03-01')
    if (scenario === 'metadata') {
      assert.equal(accountTransaction.name, 'New payee')
      assert.equal(transaction.comment, 'New description')
    }
    assert.lengthOf(await db.from('transaction_logs').where('transaction_id', transaction.id), 1)
  })

  test('create rejects inconsistent signed split totals without side effects').with(['single',
    'multiple', 'negative', 'wrong-sign']).run(async ({ client, assert }, scenario) => {
    const before = await snapshot()
    const amount = scenario === 'negative' ? -20 : 20
    const categories = scenario === 'multiple'
      ? [{ categoryId: fixture.first.id, amount: 7 }, { categoryId: fixture.second.id, amount: 12 }]
      : [{ categoryId: fixture.first.id, amount: scenario === 'negative' ? -19 : scenario ===
        'wrong-sign' ? -20 : 19 }]
    const response = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
      .json(transactionRequest({ date: '2025-03-01', name: 'Inconsistent purchase', amount,
        categories })).accept('json').loginAs(fixture.user)
    assert.deepEqual(await snapshot(), before)
    response.assertStatus(422)
  })

  test('PATCH validates resulting amount and splits atomically').with(['amount-only', 'splits-only',
    'both', 'negative']).run(async ({ client, assert }, scenario) => {
    const before = await snapshot()
    const payload = scenario === 'amount-only' ? { amount: 20 }
      : scenario === 'splits-only' ? { categories: [{ categoryId: fixture.second.id, amount: 20 }] }
        : scenario === 'negative' ? { amount: -20, categories: [{ categoryId: fixture.second.id,
          amount: -19 }] }
          : { amount: 20, categories: [{ categoryId: fixture.second.id, amount: 19 }] }
    const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
      .json(transactionRequest({ version: 0, ...payload })).accept('json').loginAs(fixture.user)
    assert.deepEqual(await snapshot(), before)
    response.assertStatus(422)
  })

  test('conserving decimal and zero amounts remain valid').with(['decimal', 'negative-decimal',
    'zero', 'empty']).run(async ({ client, assert }, scenario) => {
    const sign = scenario === 'negative-decimal' ? -1 : 1
    const amount = scenario === 'zero' || scenario === 'empty' ? 0 : sign * 0.3
    const categories = scenario === 'empty' ? [] : scenario === 'zero'
      ? [{ categoryId: fixture.first.id, amount: 0 }]
      : [{ categoryId: fixture.first.id, amount: sign * 0.1 }, { categoryId: fixture.second.id,
        amount: sign * 0.2 }]
    const response = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
      .json(transactionRequest({ date: '2025-03-01', name: 'Conserving purchase', amount,
        categories })).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(response.body().transaction.id)
    const accountTransaction = await AccountTransaction.findByOrFail('transactionId', transaction
      .id)
    assert.equal(accountTransaction.amount, amount)
    assert.equal((await Account.findOrFail(fixture.account.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(110 + amount)))
    assert.equal(transaction.categories.reduce((sum, split) => sum + Math.round(split.amount * 100),
      0), Math.round(amount * 100))
  })

  test('conserving partial PATCH does not require unchanged fields').with(['amount-only',
    'splits-only', 'empty']).run(async ({ client, assert }, scenario) => {
    const payload = scenario === 'amount-only' ? { amount: 10 }
      : scenario === 'splits-only' ? { categories: [{ categoryId: fixture.second.id, amount: 10 }] }
        : { amount: 15, categories: [] }
    const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
      .json(transactionRequest({ version: 0, ...payload })).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(fixture.transaction.id)
    const accountTransaction = await AccountTransaction.findOrFail(fixture.accountTransaction.id)
    assert.equal(transaction.categories.reduce((sum, split) => sum + split.amount, 0),
      accountTransaction.amount)
    assert.equal((await Account.findOrFail(fixture.account.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(100 + accountTransaction
      .amount)))
  })

  test('deletion reverses ordinary financial effects without destroying linkage', async ({ client,
    assert }) => {
    const response = await client.delete(`/api/v1/transaction/${fixture.transaction.id}`).accept(
      'json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.isTrue((await Transaction.findOrFail(fixture.transaction.id)).deleted)
    assert.equal((await Account.findOrFail(fixture.account.id)).balanceCents, parseMoneyCents(
      '100.00'))
    assert.equal((await Category.findOrFail(fixture.first.id)).balanceCents, parseMoneyCents(
      '0.00'))
    assert.equal((await AccountTransaction.findOrFail(fixture.accountTransaction.id)).transactionId,
      fixture.transaction.id)
  })

  test('deleted transactions cannot apply financial effects again').with(['delete', 'update']).run(
    async ({ client, assert }, operation) => {
    const url = `/api/v1/transaction/${fixture.transaction.id}`
    const deleted = await client.delete(url).accept('json').loginAs(fixture.user)
    deleted.assertStatus(200)
    const before = await snapshot()
    const response = operation === 'delete'
      ? await client.delete(url).accept('json').loginAs(fixture.user)
      : await client.patch(url).json(transactionRequest({ version: 0, amount: 25,
        categories: [{ categoryId: fixture.second.id, amount: 25 }] })).accept('json').loginAs(
          fixture.user)
    assert.deepEqual(await snapshot(), before)
    response.assertStatus(404)
  })

  test('late persistence failure rolls back the entire mutation').with(['create', 'update',
    'delete']).run(async ({ client, assert }, operation) => {
    const before = await snapshot()
    const constraint = operation === 'create'
      ? "CHECK (balance <> 30) NOT VALID" : operation === 'update'
        ? "CHECK (version <> 1) NOT VALID" : "CHECK (deleted = false) NOT VALID"
    const table = operation === 'create' ? 'categories' : 'transactions'
    await db.rawQuery(`ALTER TABLE ${table} ADD CONSTRAINT lifecycle_test_failure ${constraint}`)
    const pendingWrites = new Set<string>()
    const startedWrites: string[] = []
    const lateWrites: string[] = []
    const unhandledErrors: unknown[] = []
    let requestCompleted = false
    const connection = db.connection().getWriteClient()
    const isFinancialWrite = (sql: string) => /^update "(categories|accounts|transactions)"/.test(
      sql)
    const started = (query: { sql: string }) => {
      if (isFinancialWrite(query.sql)) {
        startedWrites.push(query.sql)
        pendingWrites.add(query.sql)
        if (requestCompleted) lateWrites.push(query.sql)
      }
    }
    const completed = (_result: unknown, query: { sql: string }) => { pendingWrites.delete(query
      .sql) }
    const rejected = (reason: unknown) => { unhandledErrors.push(reason) }
    connection.on('query', started)
    connection.on('query-response', completed)
    connection.on('query-error', completed)
    process.on('unhandledRejection', rejected)
    try {
      const response = operation === 'create'
        ? await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
          .json(transactionRequest({ date: '2025-03-01', name: 'Rejected purchase', amount: 20,
            categories: [{ categoryId: fixture.first.id, amount: 20 }] })).accept('json').loginAs(
              fixture.user)
        : operation === 'update'
          ? await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
            .json(transactionRequest({ version: 0, amount: 25, categories: [{ categoryId: fixture
              .second.id, amount: 25 }] })).accept('json').loginAs(fixture.user)
          : await client.delete(`/api/v1/transaction/${fixture.transaction.id}`).accept('json')
            .loginAs(fixture.user)
      requestCompleted = true
      response.assertStatus(500)
      assert.equal(pendingWrites.size, 0, 'financial writes must finish before the response')
      if (operation === 'delete') {
        assert.isTrue(startedWrites.some((sql) => sql.startsWith('update "categories"')))
        assert.isTrue(startedWrites.some((sql) => sql.startsWith('update "accounts"')))
        assert.isTrue(startedWrites.some((sql) => sql.startsWith('update "transactions"')))
      }
      assert.deepEqual(await snapshot(), before)
      // Let queued promise callbacks and rejection notifications run, without a timed sleep.
      await new Promise<void>((resolve) => setImmediate(resolve))
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(lateWrites, [], 'no financial write may start after the response')
      assert.deepEqual(unhandledErrors, [], 'no detached persistence rejection may follow rollback')
    } finally {
      connection.off('query', started)
      connection.off('query-response', completed)
      connection.off('query-error', completed)
      process.off('unhandledRejection', rejected)
      await db.rawQuery(`ALTER TABLE ${table} DROP CONSTRAINT lifecycle_test_failure`)
    }
  })
})
