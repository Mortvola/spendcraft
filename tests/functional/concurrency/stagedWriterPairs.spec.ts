import { transactionRequest } from '../../helpers/transactionRequest.js'
import { categoryRequest } from '../../helpers/categoryRequest.js'
import { writeCanonicalTransactionFixture } from '../../helpers/historicalTransactionFixture.js'
// Task-authorized test fixtures only. All SQL uses the accepted bootstrap driver guard.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import Institution from '#models/Institution'
import Account from '#models/Account'
import Category from '#models/Category'
import Group from '#models/Group'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'
import * as Plaid from 'plaid'

function signal() {
  let resolve: () => void = () => { throw new Error('Uninitialized barrier') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Writer barrier deadline')), 10_000)
  })]) } finally { if (timer) clearTimeout(timer) }
}
async function waitForGate(pid: number) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    const result = await db.rawQuery(`SELECT query FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`, [pid])
    if (result.rows.some((r: { query: string }) => /applications/.test(r.query) && /for update/i.test(r.query))) return
  }
  throw new Error('Budget waiter not observed')
}
async function pair(model: LucidModel, key: 'save' | 'delete', target: (row: LucidRow) => boolean,
  first: () => Promise<unknown>, second: () => Promise<unknown>, fail = false) {
  const entered = signal(), release = signal()
  let captured = false, pid = 0
  const save = model.prototype.save, remove = model.prototype.delete
  const hook = mock.method(model.prototype, key, async function (this: LucidRow) {
    const result = key === 'save' ? await save.call(this) : await remove.call(this)
    if (!captured && target(this)) {
      captured = true
      if (!this.$trx) throw new Error('Writer escaped owner transaction')
      pid = (await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
      entered.resolve(); await release.promise
      if (fail) throw new Error('Injected late writer rollback')
    }
    return result
  })
  const a = first(); void a.catch(() => undefined)
  let b: Promise<unknown> | undefined
  try { await bounded(entered.promise); b = second(); void b.catch(() => undefined); await waitForGate(pid) }
  finally { release.resolve(); await Promise.allSettled([a, ...(b ? [b] : [])]); hook.mock.restore() }
  await a; await b
}
let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx }); await budget.initialize()
    const user = await budget.related('users').create({ username: `writer-pair-${++sequence}`,
      email: `writer-pair-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Pair bank' })
    const account = await institution.related('accounts').create({ name: 'Pair account', balance: 105,
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), initialized: true, enabled: true, closed: false, rate: 0 })
    const group = await budget.related('groups').create({ name: 'Pair group', type: 'Regular' })
    const empty = await budget.related('groups').create({ name: 'Empty group', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Pair category', type: CategoryType.Regular,
      balance: 5, fundingCategories: [], useGoal: false, recurrence: 1 })
    const transaction = await budget.related('transactions').create({ date: DateTime.fromISO('2025-02-01'),
      type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: category.id, amount: 5 }], taxes: [], deleted: false })
    await writeCanonicalTransactionFixture(transaction)
    await account.related('accountTransactions').create({ transactionId: transaction.id, amount: 5, name: 'Known applied effect', pending: false })
    return { budget, user, institution, account, group, empty, category, transaction }
  })
}

test.group('Staged real writer pair PostgreSQL regressions', (group) => {
  group.each.timeout(30_000)
  test('Account/Institution deletion and manual posting preserve a valid current serial outcome')
    .with([{ institution: false, postingFirst: false }, { institution: false, postingFirst: true },
      { institution: true, postingFirst: false }, { institution: true, postingFirst: true }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      const pool = await f.budget.getFundingPoolCategory()
      const posting = () => client.post(`/api/v1/account/${f.account.id}/transactions`).json(transactionRequest({
        date: '2025-02-02', name: 'Concurrent posting', amount: 5, categories: [{ categoryId: f.category.id, amount: 5 }],
      })).loginAs(f.user).then((r) => r.assertStatus(scenario.postingFirst ? 200 : 404))
      const deletion = () => client.delete(scenario.institution ? `/api/v1/institution/${f.institution.id}`
        : `/api/v1/institution/${f.institution.id}/accounts/${f.account.id}`).loginAs(f.user).then((r) => r.assertStatus(200))
      await pair(Account, scenario.postingFirst ? 'save' : 'delete', (row) => row instanceof Account && row.id === f.account.id,
        scenario.postingFirst ? posting : deletion, scenario.postingFirst ? deletion : posting)
      assert.isNull(await Account.find(f.account.id))
      assert.equal((await Category.findOrFail(f.category.id)).balance, 0)
      assert.equal((await Category.findOrFail(pool.id)).balance, pool.balance)
      assert.lengthOf(await db.from('transactions').where('application_id', f.budget.id), 0)
      assert.lengthOf(await db.from('account_transactions').where('account_id', f.account.id), 0)
      if (scenario.institution) assert.isNull(await Institution.find(f.institution.id))
    })

  test('late Account deletion rollback releases gate and waiting posting sees authoritative balances', async ({ client, assert }) => {
    const f = await fixture()
    await pair(Account, 'delete', (row) => row instanceof Account && row.id === f.account.id,
      () => client.delete(`/api/v1/institution/${f.institution.id}/accounts/${f.account.id}`).loginAs(f.user).then((r) => r.assertStatus(500)),
      () => client.post(`/api/v1/account/${f.account.id}/transactions`).json(transactionRequest({ date: '2025-02-02', name: 'After rollback', amount: 5,
        categories: [{ categoryId: f.category.id, amount: 5 }] })).loginAs(f.user).then((r) => r.assertStatus(200)), true)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 110)
    assert.equal((await Category.findOrFail(f.category.id)).balance, 10)
    assert.lengthOf(await db.from('transactions').where('application_id', f.budget.id), 2)
    assert.lengthOf(await db.from('account_transactions').where('account_id', f.account.id), 2)
  })

  test('Group deletion and Category creation observe fresh membership in either order')
    .with([false, true])
    .run(async ({ client, assert }, creationFirst) => {
      const f = await fixture()
      const create = () => client.post(`/api/v1/groups/${f.empty.id}/categories`).json(categoryRequest({ name: 'New member', useGoal: false, fundingCategories: [] }))
        .loginAs(f.user).then((r) => r.assertStatus(creationFirst ? 200 : 404))
      const remove = () => client.delete(`/api/v1/groups/${f.empty.id}`).loginAs(f.user).then((r) => r.assertStatus(creationFirst ? 409 : 204))
      await pair(creationFirst ? Category : Group, creationFirst ? 'save' : 'delete', (row) => creationFirst
        ? row instanceof Category && row.groupId === f.empty.id : row instanceof Group && row.id === f.empty.id,
      creationFirst ? create : remove, creationFirst ? remove : create)
      const rows = await Category.query().where('groupId', f.empty.id)
      assert.lengthOf(rows, creationFirst ? 1 : 0)
      if (creationFirst) assert.isNotNull(await Group.find(f.empty.id))
      else assert.isNull(await Group.find(f.empty.id))
    })

  test('two member deletions serialize and exactly the last member removes Budget', async ({ client, assert }) => {
    const f = await fixture()
    const other = await f.budget.related('users').create({ username: `second-${++sequence}`, email: `second-${sequence}@example.com`, password: 'testPassw0rd' })
    await pair(User, 'delete', (row) => row instanceof User && row.id === f.user.id,
      () => client.delete('/api/v1/user').loginAs(f.user).then((r) => r.assertStatus(200)),
      () => client.delete('/api/v1/user').loginAs(other).then((r) => r.assertStatus(200)))
    assert.isNull(await Budget.find(f.budget.id)); assert.isNull(await User.find(other.id)); assert.isNull(await User.find(f.user.id))
    assert.isNull(await Account.find(f.account.id)); assert.isNull(await Category.find(f.category.id))
  })

  test('unlink and actual Plaid synchronization do not resurrect credentials or cursor')
    .with([false, true])
    .run(async ({ client, assert, cleanup }, syncFirst) => {
      const f = await fixture()
      await f.institution.merge({ accessToken: 'access-test-pair', institutionId: 'pair-bank', plaidItemId: 'pair-item', cursor: 'old' }).save()
      const provider = await app.container.make('plaid')
      let syncCalls = 0
      const sync = mock.method(provider, 'syncTransactions', async () => {
        syncCalls++
        return { accounts: [], added: [], modified: [], removed: [], next_cursor: 'advanced', has_more: false,
          transactions_update_status: Plaid.TransactionsUpdateStatus.HistoricalUpdateComplete, request_id: 'test' }
      })
      const remove = mock.method(provider, 'removeItem', async () => ({ request_id: 'test' }))
      cleanup(() => { sync.mock.restore(); remove.mock.restore() })
      const synchronize = () => db.transaction(async (trx) => {
        const institution = await Institution.findOrFail(f.institution.id, { client: trx })
        try { await institution.syncUpdate(); assert.isTrue(syncFirst) }
        catch (error) {
          if (syncFirst || !(error instanceof Error)) throw error
          assert.equal(error.message, 'access token is null')
        }
      })
      const unlink = () => client.post(`/api/v1/institution/${f.institution.id}/unlink`).loginAs(f.user).then((r) => r.assertStatus(200))
      await pair(Institution, 'save', (row) => row instanceof Institution && row.id === f.institution.id,
        syncFirst ? synchronize : unlink, syncFirst ? unlink : synchronize)
      const fresh = await Institution.findOrFail(f.institution.id)
      assert.isNull(fresh.accessToken); assert.isNull(fresh.plaidItemId); assert.isNull(fresh.cursor)
      assert.equal(syncCalls, syncFirst ? 1 : 0)
      assert.equal((await Account.findOrFail(f.account.id)).balance, 105)
      assert.equal((await Category.findOrFail(f.category.id)).balance, 5)
    })
})
