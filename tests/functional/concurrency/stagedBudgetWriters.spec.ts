import { encodeTaxForecast } from '#services/taxMonetaryCodec'
import { categoryRequest } from '../../helpers/categoryRequest.js'
import {
  writeCanonicalTransactionFixture, writeHistoricalTransactionFixture,
} from '../../helpers/historicalTransactionFixture.js'
// PREPARED ONLY: requires fresh localhost:5432/spendcraft_test authorization.
// Use tests/bootstrap.ts and its centralized per-statement pg/pgLog/execution guard.
// This suite adds no direct cleanup SQL; bootstrap cleanup is independently guarded.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import ace from '@adonisjs/core/services/ace'
import env from '#start/env'
import * as Plaid from 'plaid'
import Institution from '#models/Institution'
import PlaidRemoveItem from '../../../commands/PlaidRemoveItem.js'
import PlaidGetItem from '../../../commands/PlaidGetItem.js'
import CheckUnassigned from '../../../commands/CheckUnassigned.js'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import type { ModelAdapterOptions } from '@adonisjs/lucid/types/model'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Account from '#models/Account'
import Tax from '#models/Tax'
import { AccountType, CategoryType, FilingStatus, TrackingType, TransactionType } from
  '#common/ResponseTypes'
import { installDatabaseSafety } from '../../helpers/databaseSafety.js'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx }); await budget.initialize()
    const user = await budget.related('users').create({ username: `staged-gate-${++sequence}`,
      email: `staged-gate-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Offline fixture' })
    const account = await institution.related('accounts').create({ name: 'Account', balance: 105,
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), initialized: true, enabled: true, closed: false,
        rate: 0 })
    const group = await budget.related('groups').create({ name: 'Catalog', type: 'Regular' })
    const empty = await budget.related('groups').create({ name: 'Empty', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Target', type: CategoryType
      .Regular,
      balance: 5, fundingAmount: 5, fundingCategories: [], useGoal: false, recurrence: 1 })
    // Known current eligible applied effect; no historical reversal acceptance inferred.
    const transaction = await budget.related('transactions').create({ date: DateTime.fromISO(
      '2025-02-01'),
      type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: category.id,
        amount: 5 }], taxes: [], deleted: false })
    await writeCanonicalTransactionFixture(transaction)
    await account.related('accountTransactions').create({ transactionId: transaction.id, amount: 5,
      name: 'Purchase', pending: false })
    return { budget, user, institution, account, group, empty, category, transaction }
  })
}
type Fixture = Awaited<ReturnType<typeof fixture>>
function forecast(value: number) {
  return { filingStatus: FilingStatus.Single, taxableInterest: value,
    qualifiedDividends: 0, ordinaryDividends: 0, taxableIraDistributions: 0,
    taxablePensionAndAnnuities: 0, taxableSocialSecurityBenefits: 0, additionalTaxableIncome: 0,
    shortTermCapitalGains: 0, longTermCapitalGains: 0, qualifiedBusinessIncomeDeduction: 0 }
}
const operations = ['addGroup', 'updateGroup', 'deleteGroup', 'addCategory', 'updateCategory',
  'rename', 'addAccount', 'unlink', 'deleteAccount', 'deleteInstitution', 'dedup', 'tax',
    'deleteUser'] as const
type Operation = typeof operations[number]
function request(client: ApiClient, f: Fixture, operation: Operation) {
  switch (operation) {
    case 'addGroup': return client.post('/api/v1/groups').json({ name: 'Added' })
    case 'updateGroup': return client.patch(`/api/v1/groups/${f.group.id}`).json({ name:
      'Renamed' })
    case 'deleteGroup': return client.delete(`/api/v1/groups/${f.empty.id}`)
    case 'addCategory': return client.post(`/api/v1/groups/${f.group.id}/categories`).json(
      categoryRequest({ name: 'Added', useGoal: false, fundingCategories: [] }))
    case 'updateCategory': return client.patch(`/api/v1/groups/${f.group.id}/categories/${f.category
      .id}`).json(categoryRequest({ name: 'Changed' }))
    case 'rename': return client.patch(`/api/v1/institution/${f.institution.id}`).json({ name:
      'Renamed' })
    case 'addAccount': return client.post(`/api/v1/institution/${f.institution.id}/accounts`).json({
      name: 'Added', balance: '10.00',
      startDate: '2025-01-01', type: AccountType.Depository, subtype: 'checking',
        tracking: TrackingType.Transactions })
    case 'unlink': return client.post(`/api/v1/institution/${f.institution.id}/unlink`)
    case 'deleteAccount': return client.delete(`/api/v1/institution/${f.institution.id}/accounts/${f
      .account.id}`)
    case 'deleteInstitution': return client.delete(`/api/v1/institution/${f.institution.id}`)
    case 'dedup': return client.post(`/api/v1/transaction/${f.transaction.id}/dedup`)
    case 'tax': return client.post('/api/v1/taxes').json({ year: 2026, forecast: encodeTaxForecast(
      forecast(25)) })
    case 'deleteUser': return client.delete('/api/v1/user')
  }
}
async function deadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Deterministic gate barrier deadline')), 10_000)
  })]) } finally { if (timer) clearTimeout(timer) }
}
async function waitForGate(pid: number) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    const result = await db.rawQuery(`SELECT query FROM pg_stat_activity
      WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`, [pid])
    if (result.rows.some((row: { query: string }) => /applications/.test(row.query) && /for update/i
      .test(row.query))) return
  }
  throw new Error('Expected Budget FOR UPDATE waiter not observed')
}
async function rawState() {
  const result: Record<string, unknown> = {}
  for (const table of ['applications', 'users', 'groups', 'categories', 'institutions', 'accounts',
    'transactions', 'account_transactions', 'statements', 'taxes', 'transaction_logs']) {
    result[table] = await db.from(table).orderBy('id')
  }
  return result
}

test.group('Staged Budget writers PostgreSQL acceptance', (group) => {
  group.each.timeout(30_000)
  // Independent guard also covers every fixture write, local rollback fixture, and returned
  // teardown.
  group.setup(async () => {
    const safety = await installDatabaseSafety(db)
    return async () => { try { await safety.verify() } finally { await safety.close() } }
  })

  for (const operation of operations) {
    test(`${operation}: same-Budget waiter reloads after owner commit or rollback`)
      .with(['commit', 'rollback', 'different-budget'] as const)
      .run(async ({ client, assert }, ordering) => {
        const held = await fixture()
        const target = ordering === 'different-budget' ? await fixture() : held
        const trx = await db.transaction()
        let response: ReturnType<ReturnType<typeof request>['then']> | undefined
        try {
          await Budget.query({ client: trx }).where('id', held.budget.id).forUpdate().firstOrFail()
          const pid = (await trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
          // Commit/rollback a mutable configuration value while the endpoint waits.
          const category = await Category.findOrFail(held.category.id, { client: trx })
          category.fundingAmount = 37; await category.save()
          const pending = request(client, target, operation).accept('json').loginAs(target.user)
            .then((value) => value)
          response = pending; void pending.catch(() => undefined)
          if (ordering === 'different-budget') await deadline(pending)
          else await waitForGate(pid)
          if (ordering === 'commit') await trx.commit()
          else await trx.rollback()
          const result = await deadline(pending)
          result.assertStatus(operation === 'deleteGroup' ? 204 : 200)
          if (!['deleteUser', 'deleteAccount', 'deleteInstitution'].includes(operation)) {
            const fresh = await Category.findOrFail(target.category.id)
            assert.equal(fresh.balance, 5)
            assert.equal(fresh.fundingAmount, ordering === 'commit' ? 37 : 5)
          }
          if (operation === 'tax') {
            const rows = await Tax.query().where('budgetId', target.budget.id).where('year', 2026)
            assert.lengthOf(rows, 1); assert.equal(rows[0].data.taxableInterest, 25)
          }
          if (operation === 'dedup') {
            const row = await db.from('transactions').where('id', target.transaction.id).first()
            assert.isNull(row.duplicate_of_transaction_id)
            assert.deepEqual(row.categories, [{ categoryId: target.category.id, amount: '5.00' }])
          }
          if (operation === 'addAccount') {
            const rows = await db.from('accounts').where('institution_id', target.institution.id)
              .where('name', 'Added')
            assert.lengthOf(rows, 1)
            assert.lengthOf(await db.from('account_transactions').where('account_id', rows[0].id),
              0)
          }
        } finally {
          if (!trx.isCompleted) await trx.rollback()
          if (response) await Promise.allSettled([response])
        }
      })
  }

  test('tax first creation in both request orders produces one complete persisted forecast')
    .with([[10, 20], [20, 10]])
    .run(async ({ client, assert }, values) => {
      const f = await fixture()
      const trx = await db.transaction()
      let a: Promise<unknown> | undefined, b: Promise<unknown> | undefined
      try {
        await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
        const pid = (await trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
        a = client.post('/api/v1/taxes').json({ year: 2026, forecast: encodeTaxForecast(forecast(
          values[0])) }).loginAs(f.user).then((r) => r.assertStatus(200))
        void a.catch(() => undefined)
        await waitForGate(pid)
        b = client.post('/api/v1/taxes').json({ year: 2026, forecast: encodeTaxForecast(forecast(
          values[1])) }).loginAs(f.user).then((r) => r.assertStatus(200))
        void b.catch(() => undefined)
        await trx.commit(); await deadline(Promise.all([a, b]))
        const rows = await Tax.query().where('budgetId', f.budget.id).where('year', 2026)
        assert.lengthOf(rows, 1)
        assert.include(values, rows[0].data.taxableInterest)
      } finally {
        if (!trx.isCompleted) await trx.rollback()
        await Promise.allSettled([...(a ? [a] : []), ...(b ? [b] : [])])
      }
    })

  test('late tax-save failure rolls back full persisted state', async ({ client, assert,
    cleanup }) => {
    const f = await fixture()
    const created = await client.post('/api/v1/taxes').json({ year: 2026,
      forecast: encodeTaxForecast(forecast(10)) }).loginAs(f.user)
    created.assertStatus(200)
    const before = await rawState()
    const original = Tax.prototype.save
    const interception = mock.method(Tax.prototype, 'save', async function (this: Tax) {
      const result = await original.call(this)
      if (this.budgetId === f.budget.id) throw new Error('Injected tax failure after save')
      return result
    })
    cleanup(() => interception.mock.restore())
    const response = await client.post('/api/v1/taxes').json({ year: 2026,
      forecast: encodeTaxForecast(forecast(20)) }).loginAs(f.user)
    response.assertStatus(500)
    assert.deepEqual(await rawState(), before)
  })

  test('Category complete explicit settings compose in both serial request orders')
    .with([[{ name: 'A', fundingAmount: 8 }, { name: 'B', fundingAmount: 5 }],
      [{ name: 'B', fundingAmount: 5 }, { name: 'A', fundingAmount: 8 }]])
    .run(async ({ client, assert, cleanup }, values) => {
      const f = await fixture()
      let entered: () => void = () => { throw new Error('Barrier not initialized') }
      let release: () => void = () => { throw new Error('Barrier not initialized') }
      const held = new Promise<void>((resolve) => { entered = resolve })
      const proceed = new Promise<void>((resolve) => { release = resolve })
      let pid = 0, intercepted = false
      const original = Category.prototype.save
      const hook = mock.method(Category.prototype, 'save', async function (this: Category) {
        const result = await original.call(this)
        if (this.id === f.category.id && !intercepted) {
          intercepted = true
          if (!this.$trx) throw new Error('Category write escaped owner')
          pid = (await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
          entered(); await proceed
        }
        return result
      })
      cleanup(() => hook.mock.restore())
      const path = `/api/v1/groups/${f.group.id}/categories/${f.category.id}`
      const a = client.patch(path).json(categoryRequest(values[0])).loginAs(f.user).then((r) => r
        .assertStatus(200))
      void a.catch(() => undefined)
      let b: Promise<unknown> | undefined
      try {
        await deadline(held)
        b = client.patch(path).json(categoryRequest(values[1])).loginAs(f.user).then((r) => r
          .assertStatus(200))
        void b.catch(() => undefined)
        await waitForGate(pid)
      } finally { release(); await Promise.allSettled([a, ...(b ? [b] : [])]) }
      await a; await b
      const fresh = await Category.findOrFail(f.category.id)
      assert.equal(fresh.name, values[1].name); assert.equal(fresh.fundingAmount, values[1]
        .fundingAmount)
      assert.equal(fresh.balance, 5)
    })


  test('provider identity CLI reloads token after real Budget wait')
    .with(['remove', 'get-fix', 'remove-unlinked', 'get-fix-unlinked'])
    .run(async ({ assert, cleanup }, scenario) => {
      const f = await fixture()
      const token = `access-${env.get('PLAID_ENV')}-test-${f.institution.id}`
      await f.institution.merge({ accessToken: token, institutionId: 'test-bank', plaidItemId:
        'old-item', cursor: 'preserve-cursor' }).save()
      const provider = await app.container.make('plaid')
      let removals = 0
      const remove = mock.method(provider, 'removeItem', async () => { removals++; return {
        request_id: 'test' } })
      const get = mock.method(provider, 'getItem', async () => ({ request_id: 'test', status: null,
        item: {
        item_id: 'provider-item', institution_id: 'test-bank', webhook: null, error: null,
        available_products: [], billed_products: [], products: [], consent_expiration_time: null,
        update_type: Plaid.ItemUpdateTypeEnum.Background,
      } }))
      cleanup(() => { remove.mock.restore(); get.mock.restore() })
      const command = scenario.startsWith('remove') ? await ace.create(PlaidRemoveItem, [token])
        : await ace.create(PlaidGetItem, [token, '--fix'])
      const info = mock.method(command.logger, 'info', () => undefined)
      const error = mock.method(command.logger, 'error', () => undefined)
      cleanup(() => { info.mock.restore(); error.mock.restore() })
      const trx = await db.transaction()
      let pending: Promise<void> | undefined
      try {
        await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
        const pid = (await trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
        pending = command.run(); void pending.catch(() => undefined)
        await waitForGate(pid)
        if (scenario.endsWith('unlinked')) {
          const institution = await Institution.findOrFail(f.institution.id, { client: trx })
          await institution.merge({ accessToken: null, plaidItemId: null, cursor: null }).save()
        }
        await trx.commit(); await deadline(pending)
        const fresh = await Institution.findOrFail(f.institution.id)
        if (scenario.endsWith('unlinked')) {
          assert.isNull(fresh.accessToken); assert.isNull(fresh.plaidItemId); assert.isNull(fresh
            .cursor)
          assert.equal(removals, 0)
        } else if (scenario === 'remove') {
          assert.isNull(fresh.accessToken); assert.isNull(fresh.plaidItemId); assert.equal(removals,
            1)
          assert.equal(fresh.cursor, 'preserve-cursor')
        } else {
          assert.equal(fresh.plaidItemId, 'provider-item'); assert.equal(fresh.accessToken, token)
          assert.equal(fresh.cursor, 'preserve-cursor')
        }
        assert.equal((await Category.findOrFail(f.category.id)).balance, 5)
      } finally {
        if (!trx.isCompleted) await trx.rollback()
        if (pending) await Promise.allSettled([pending])
      }
    })

  test('CheckUnassigned skips an explicit allocation committed before its Budget acquisition',
    async ({ assert, cleanup }) => {
    const f = await fixture()
    // Other suites intentionally leave noninitialized Budget fixtures. Isolate this command's
    // discovery, not its protected reads.
    const originalQuery = Budget.query.bind(Budget)
    const discovery = mock.method(Budget, 'query', (options?: ModelAdapterOptions) => {
      const query = originalQuery(options)
      if (!options) query.where('id', f.budget.id)
      return query
    })
    cleanup(() => discovery.mock.restore())
    await writeHistoricalTransactionFixture(f.transaction, { categories: [] })
    const command = await ace.create(CheckUnassigned, [])
    const trx = await db.transaction()
    let pending: Promise<void> | undefined
    try {
      await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
      const pid = (await trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
      pending = command.run(); void pending.catch(() => undefined)
      await waitForGate(pid)
      await trx.from('transactions').where('id', f.transaction.id)
        .update({ categories: JSON.stringify([{ categoryId: f.category.id, amount: 5 }]) })
      await trx.commit(); await deadline(pending)
      const row = await db.from('transactions').where('id', f.transaction.id).first()
      assert.deepEqual(row.categories, [{ categoryId: f.category.id, amount: 5 }])
      assert.equal((await Category.findOrFail(f.category.id)).balance, 5)
    } finally {
      if (!trx.isCompleted) await trx.rollback()
      if (pending) await Promise.allSettled([pending])
    }
  })


  test('foreign catalog, Institution, Account and Transaction targets reject without mutation')
    .with(['updateGroup', 'deleteGroup', 'addCategory', 'updateCategory', 'rename', 'addAccount',
      'unlink', 'deleteAccount', 'deleteInstitution', 'dedup'] as const)
    .run(async ({ client, assert }, operation) => {
      const own = await fixture(), foreign = await fixture()
      const before = await rawState()
      const response = await request(client, foreign, operation).accept('json').loginAs(own.user)
      response.assertStatus(404)
      assert.deepEqual(await rawState(), before)
    })

  test('Account cascade late failure rolls back full known-effect fixture state', async ({ client,
    assert, cleanup }) => {
    const f = await fixture()
    const before = await rawState()
    const original = Account.prototype.delete
    const hook = mock.method(Account.prototype, 'delete', async function (this: Account) {
      await original.call(this)
      if (this.id === f.account.id) throw new Error('Injected failure after Account deletion')
    })
    cleanup(() => hook.mock.restore())
    const response = await request(client, f, 'deleteAccount').accept('json').loginAs(f.user)
    response.assertStatus(500)
    assert.deepEqual(await rawState(), before)
  })

})
