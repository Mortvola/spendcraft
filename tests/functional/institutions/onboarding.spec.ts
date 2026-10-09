import { test } from '@japa/runner'
import { mock } from 'node:test'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import ace from '@adonisjs/core/services/ace'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import * as Plaid from 'plaid'
import PlaidWrapper from '#providers/Plaid/Plaid'
import Budget from '#models/Budget'
import { CategoryType } from '#common/ResponseTypes'
import Category from '#models/Category'
import User from '#models/User'
import Institution from '#models/Institution'
import Account from '#models/Account'
import AccountTransaction from '#models/AccountTransaction'
import PlaidLog from '#models/PlaidLog'
import ApplePushNotifications from '#providers/ApplePushNotifications/index'
import { BullMQ } from '#providers/BullMQ'
import type { ConnectionOptions, Processor, WorkerOptions } from 'bullmq'
import { QueueNamesEnum, type PlaidWebHookProps } from '#contracts/QueueInterfaces'
import InstitutionSync from '../../../commands/InstitutionSync.js'
import QueueListener from '../../../commands/QueueListener.js'
import WebhookController from '#controllers/WebhookController'

function providerTransaction(accountId: string, id: string, overrides: Partial<Plaid.Transaction> = {}): Plaid.Transaction {
  return {
    account_id: accountId, transaction_id: id, amount: 10, date: '2025-02-10', name: 'Provider purchase', merchant_name: null,
    iso_currency_code: 'USD', unofficial_currency_code: null, location: { address: null, city: null, region: null, postal_code: null, country: null, lat: null, lon: null, store_number: null },
    payment_meta: { reference_number: null, ppd_id: null, payee: null, by_order_of: null, payer: null, payment_method: null, payment_processor: null, reason: null },
    pending: false, pending_transaction_id: null, account_owner: null, authorized_date: null,
    authorized_datetime: null, datetime: null, payment_channel: Plaid.TransactionPaymentChannelEnum.Online,
    transaction_code: null, ...overrides,
  }
}

function providerAccount(id: string): Plaid.AccountBase {
  return {
    account_id: id, name: 'Provider checking', official_name: null, mask: '1234',
    type: Plaid.AccountType.Depository, subtype: Plaid.AccountSubtype.Checking,
    balances: { available: 100, current: 100, limit: null, iso_currency_code: 'USD', unofficial_currency_code: null },
  }
}

function page(accounts: Plaid.AccountBase[], cursor: string, overrides: Partial<Plaid.TransactionsSyncResponse> = {}): Plaid.TransactionsSyncResponse {
  return {
    accounts, added: [], modified: [], removed: [], next_cursor: cursor, has_more: false,
    transactions_update_status: Plaid.TransactionsUpdateStatus.HistoricalUpdateComplete, request_id: 'fake-sync', ...overrides,
  }
}

const token = 'TEST_PLAID_ACCESS_TOKEN_DO_NOT_LOG'
const tables = ['institutions', 'accounts', 'transactions', 'account_transactions', 'categories', 'groups', 'statements', 'balance_histories', 'transaction_logs']
async function snapshot() {
  const result: Record<string, unknown[]> = {}
  for (const table of tables) result[table] = await db.from(table).orderBy('id')
  return result
}

// Exercise the real worker and producer on a private local queue, never the application queue.
class OnboardingBull extends BullMQ {
  name = `spendcraft-onboarding-${randomUUID()}`
  processNext: (() => Promise<boolean>) | undefined
  closeWorker: (() => Promise<void>) | undefined
  worker<T, R, N extends string = string>(name: string, callback: string | Processor<T, R, N>, options?: WorkerOptions) {
    if (name !== QueueNamesEnum.PlaidWebHook || typeof callback !== 'function') throw new Error('Unexpected worker')
    const worker = super.worker(this.name, callback, { ...options, connection: this.connection, autorun: false })
    this.closeWorker = () => worker.close()
    this.processNext = async () => {
      await worker.waitUntilReady()
      const lock = randomUUID()
      const job = await worker.getNextJob(lock, { block: false })
      if (!job) return false
      await worker.processJob(job, lock, () => false)
      return true
    }
    return worker
  }
}

test.group('Plaid staged onboarding characterization', (group) => {
  let budget: Budget
  let user: User
  let wrapper: PlaidWrapper
  let id: string
  let accountId: string
  let failure: string | undefined
  let responses: (Plaid.TransactionsSyncResponse | Error)[]
  let cursors: (string | null)[]
  let committed: Awaited<ReturnType<typeof snapshot>> | undefined
  let logs: string[]
  let removed: string[]
  let restores: (() => void)[]
  let auditStart: number
  let failedSyncState: { cursor: string | null, syncDate: string | null } | undefined

  const success = () => page([providerAccount(accountId)], 'c2', { added: [providerTransaction(accountId, 'purchase', { date: DateTime.now().startOf('month').plus({ days: 1 }).toISODate() ?? '' })] })

  group.each.setup(async () => {
    budget = await db.transaction(async (trx) => {
      const created = await Budget.create({}, { client: trx })
      await created.initialize()
      return created
    })
    id = randomUUID()
    accountId = `account-${id}`
    user = await budget.related('users').create({ username: id, email: `${id}@example.com`, password: 'testPassw0rd' })
    auditStart = (await PlaidLog.query().orderBy('id', 'desc').first())?.id ?? 0
    wrapper = new PlaidWrapper(app.config.get('plaid'))
    app.container.swap(PlaidWrapper, () => wrapper)
    responses = []; cursors = []; logs = []; removed = []; restores = []; committed = undefined; failure = undefined; failedSyncState = undefined
    const auditResponse = (data: unknown, path: string) => ({ data, status: 200, request: { path } })
    const exchanged = new Set<string>()
    const exchange = mock.method(wrapper.plaid, 'itemPublicTokenExchange', async (body: Plaid.ItemPublicTokenExchangeRequest) => {
      if (failure === 'exchange') throw new Error('Synthetic exchange failure')
      if (exchanged.has(body.public_token)) throw new Error('Synthetic already-exchanged public token')
      exchanged.add(body.public_token)
      return auditResponse({ access_token: token, item_id: id, request_id: 'exchange' }, '/item/public_token/exchange')
    })
    const institution = mock.method(wrapper.plaid, 'institutionsGetById', async () => {
      if (failure === 'provider institution') throw new Error('Synthetic institution retrieval failure')
      return auditResponse({ institution: { institution_id: 'test-bank', name: 'Onboarding bank' }, request_id: 'institution' }, '/institutions/get_by_id')
    })
    const accounts = mock.method(wrapper.plaid, 'accountsGet', async () => {
      if (failure === 'provider accounts') throw new Error('Synthetic account retrieval failure')
      return auditResponse({ accounts: [providerAccount(accountId)], request_id: 'accounts' }, '/accounts/get')
    })
    const sync = mock.method(wrapper.plaid, 'transactionsSync', async (body: Plaid.TransactionsSyncRequest) => {
      if (!committed) committed = await snapshot()
      cursors.push(body.cursor ?? null)
      const response = responses.shift()
      if (!response) throw new Error('Synthetic sync responses exhausted')
      if (response instanceof Error) throw response
      return auditResponse(response, '/transactions/sync')
    })
    const remove = mock.method(wrapper.plaid, 'itemRemove', async (body: Plaid.ItemRemoveRequest) => {
      removed.push(body.access_token)
      if (failure === 'cleanup removal') throw new Error('Synthetic Item removal failure')
      return auditResponse({ request_id: 'remove' }, '/item/remove')
    })
    const logging = mock.method(logger, 'error', (...args: unknown[]) => { logs.push(JSON.stringify(args)) })
    restores.push(...[exchange, institution, accounts, sync, remove, logging].map((entry) => () => entry.mock.restore()))
    return async () => {
      // Separate audit commits survive rollback; clean only records made by this test.
      await PlaidLog.query().where('id', '>', auditStart).delete()
      for (const restore of restores.reverse()) restore()
      app.container.restore(PlaidWrapper)
    }
  })

  function persistenceFailure(stage: string) {
    if (stage === 'local institution' || stage === 'cursor') {
      const save = Institution.prototype.save
      const patched = mock.method(Institution.prototype, 'save', function (this: Institution) {
        if (stage === 'cursor' && this.cursor === 'c2') {
          failedSyncState = { cursor: this.cursor, syncDate: this.syncDate?.toISO() ?? null }
          throw new Error('Synthetic cursor persistence failure')
        }
        if (stage === 'local institution' && !this.$isPersisted) throw new Error('Synthetic institution persistence failure')
        return save.call(this)
      })
      restores.push(() => patched.mock.restore())
    } else if (stage === 'local account') {
      const patched = mock.method(Account.prototype, 'save', function () { throw new Error('Synthetic account persistence failure') })
      restores.push(() => patched.mock.restore())
    } else if (stage === 'financial') {
      const patched = mock.method(AccountTransaction.prototype, 'save', function () { throw new Error('Synthetic financial persistence failure') })
      restores.push(() => patched.mock.restore())
    }
  }

  test('setup failures roll back all local financial state and remove exchanged Items').with(['exchange', 'provider institution', 'provider accounts', 'local institution', 'local account']).run(async ({ client, assert }, stage) => {
    failure = stage
    persistenceFailure(stage)
    const before = await snapshot()
    const response = await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })
    response.assertStatus(500)
    assert.deepEqual(await snapshot(), before)
    assert.lengthOf(removed, stage === 'exchange' ? 0 : 1)
    assert.isEmpty(cursors)
    assert.notInclude(JSON.stringify(response.body()), token)
    assert.notInclude(logs.join(''), token)
    assert.notInclude(JSON.stringify(await PlaidLog.query()), token)
  })

  test('initial sync failure keeps committed setup, rolls back sync, and returns success').with(['first page', 'later page', 'financial', 'cursor']).run(async ({ client, assert }, stage) => {
    persistenceFailure(stage)
    responses = stage === 'first page' ? [new Error('Synthetic first-page failure')]
      : stage === 'later page' ? [{ ...success(), next_cursor: 'c1', has_more: true }, new Error('Synthetic later-page failure')]
        : [success()]
    const response = await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })
    response.assertStatus(200)
    if (!committed) throw new Error('Sync did not see durable setup')
    assert.deepEqual(await snapshot(), committed)
    const inst = await Institution.query().where('budgetId', budget.id).firstOrFail()
    assert.equal(inst.accessToken, token)
    assert.isNull(inst.cursor)
    assert.isNull(inst.syncDate)
    assert.lengthOf(await inst.related('accounts').query(), 1)
    assert.isEmpty(removed)
    assert.equal(response.body().data.id, inst.id)
    // The failed save saw changed attributes, but the response must describe durable state.
    if (stage === 'cursor') {
      assert.equal(failedSyncState?.cursor, 'c2')
      assert.isString(failedSyncState?.syncDate)
    }
    assert.equal(response.body().data.syncDate, inst.syncDate?.toISO() ?? null)
    assert.equal(response.body().data.plaidInstitutionId, inst.institutionId)
    assert.equal(response.body().data.name, inst.name)
    for (const returned of response.body().data.accounts) {
      const account = await Account.findOrFail(returned.id)
      assert.equal(account.institutionId, inst.id)
      assert.equal(returned.balance, account.balance)
      assert.equal(returned.plaidBalance, account.plaidBalance)
      assert.equal(returned.plaidId, account.plaidAccountId)
      assert.equal(returned.startDate, account.startDate.toISODate())
    }
    const categories = [await budget.getFundingPoolCategory(), await budget.getUnassignedCategory()]
    for (const category of categories) assert.deepInclude(response.body().data.categories, { id: category.id, balance: category.balance })
    for (const returned of response.body().data.categories) {
      const category = await Category.findOrFail(returned.id)
      assert.equal(returned.balance, category.balance)
      assert.equal((await category.related('group').query().firstOrFail()).budgetId, budget.id)
    }
    assert.lengthOf(await budget.getConnectedAccounts(), 1)
    const read = await client.get('/api/v1/connected-accounts').loginAs(user)
    read.assertStatus(200)
    assert.lengthOf(read.body().data, 1)
    assert.equal(read.body().data[0].id, inst.id)
    assert.isNull(read.body().data[0].syncDate)
    assert.notInclude(JSON.stringify(read.body()), token)
    // Audit responses commit separately, including a successful page later rolled back.
    const audit = await PlaidLog.query().where('id', '>', auditStart)
    assert.lengthOf(audit, stage === 'first page' ? 3 : 4)
    assert.notInclude(JSON.stringify(response.body()), token)
    assert.notInclude(logs.join(''), token)
    assert.notInclude(JSON.stringify(await PlaidLog.query()), token)
  })

  test('staged connection recovers through existing sync mechanisms without duplicate financial effects').with(['manual', 'sync all', 'command', 'webhook']).run(async ({ client, assert, cleanup }, mechanism) => {
    responses = [new Error('Synthetic initial sync failure')]
    ;(await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })).assertStatus(200)
    const inst = await Institution.query().where('budgetId', budget.id).firstOrFail()
    const account = await inst.related('accounts').query().firstOrFail()
    responses = [success()]
    if (mechanism === 'manual') {
      ;(await client.post(`/api/v1/institution/${inst.id}/accounts/${account.id}/transactions/sync`).loginAs(user)).assertStatus(200)
    } else if (mechanism === 'sync all') {
      ;(await client.post('/api/v1/institutions/sync').loginAs(user)).assertStatus(200)
    } else if (mechanism === 'command') {
      const command = await ace.create(InstitutionSync, [id])
      await command.run()
    } else {
      const connection = app.config.get<ConnectionOptions>('bullmq')
      if (!('host' in connection) || !['localhost', '127.0.0.1'].includes(connection.host ?? '')) throw new Error('Requires local Redis')
      const bull = new OnboardingBull(connection)
      const queue = bull.queue<PlaidWebHookProps, PlaidWebHookProps>(bull.name)
      const producer = mock.method(bull, 'queue', () => queue)
      app.container.swap(BullMQ, () => bull)
      const push = mock.method(ApplePushNotifications.prototype, 'sendPushNotifications', async () => { /* No external push in characterization. */ })
      cleanup(async () => {
        await bull.closeWorker?.()
        await queue.obliterate({ force: true })
        const redis = await queue.backend.client
        let cursor = '0'
        do {
          const [next, keys] = await redis.scan(cursor, { MATCH: `bull:${bull.name}:*` })
          assert.isEmpty(keys)
          cursor = next
        } while (cursor !== '0')
        await queue.close()
        producer.mock.restore(); push.mock.restore(); app.container.restore(BullMQ)
      })
      const command = await ace.create(QueueListener, [])
      await command.run()
      await WebhookController.syncUpdate({ environment: Plaid.WebhookEnvironmentValues.Sandbox, webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: id, initial_update_complete: true, historical_update_complete: true })
      if (!bull.processNext) throw new Error('Worker not registered')
      assert.isTrue(await bull.processNext())
      assert.equal(push.mock.callCount(), 1)
    }
    await inst.refresh()
    assert.equal(inst.cursor, 'c2')
    assert.deepEqual(cursors, [null, null])
    assert.equal((await inst.related('accounts').query().firstOrFail()).id, account.id)
    const purchase = await AccountTransaction.query().where('accountId', account.id).where('providerTransactionId', 'purchase').firstOrFail()
    assert.equal(purchase.amount, -10)
    assert.equal((await Account.findOrFail(account.id)).balance, 100)
    assert.equal((await budget.getUnassignedCategory()).balance, -10)
    assert.equal((await budget.getFundingPoolCategory()).balance, 110)
    const recovered = await snapshot()
    responses = [success()]
    ;(await client.post(`/api/v1/institution/${inst.id}/accounts/${account.id}/transactions/sync`).loginAs(user)).assertStatus(200)
    assert.deepEqual(await snapshot(), recovered)
    assert.lengthOf(await AccountTransaction.query().where('accountId', account.id).where('providerTransactionId', 'purchase'), 1)
    assert.lengthOf(await Institution.query().where('budgetId', budget.id), 1)
    assert.lengthOf(await inst.related('accounts').query(), 1)
    assert.equal((await Account.findOrFail(account.id)).balance, 100)
    assert.equal((await budget.getUnassignedCategory()).balance, -10)
    assert.notInclude(logs.join(''), token)
  })

  test('successful onboarding returns committed category and account balances').with(['unassigned', 'automatic', 'before start', 'pending']).run(async ({ client, assert }, allocation) => {
    const group = await budget.related('groups').create({ name: 'Response allocations', type: 'Regular' })
    const assigned = await group.related('categories').create({ name: 'Assigned', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    const untouched = await group.related('categories').create({ name: 'Untouched', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    if (allocation === 'automatic') {
      const rule = await budget.related('autoAssignment').create({ name: 'Response rule', searchStrings: ['Provider purchase'] })
      await rule.related('categories').create({ categoryId: assigned.id, amount: 100, percentage: true })
    }
    const provider = providerAccount(accountId)
    provider.balances.current = 175
    const date = allocation === 'before start'
      ? DateTime.now().startOf('month').minus({ days: 1 }).toISODate()
      : DateTime.now().startOf('month').plus({ days: 1 }).toISODate()
    responses = [page([provider], 'c2', { added: [providerTransaction(accountId, 'purchase', { amount: 37, date: date ?? '', pending: allocation === 'pending' })] })]
    const response = await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })
    response.assertStatus(200)
    const inst = await Institution.query().where('budgetId', budget.id).firstOrFail()
    const account = await inst.related('accounts').query().firstOrFail()
    assert.equal(inst.cursor, 'c2')
    assert.isNotNull(inst.syncDate)
    assert.equal(response.body().data.syncDate, inst.syncDate?.toISO())
    assert.equal(response.body().data.id, inst.id)
    assert.equal(response.body().data.accounts[0].id, account.id)
    assert.equal(account.balance, 175)
    const unassigned = await budget.getUnassignedCategory()
    const funding = await budget.getFundingPoolCategory()
    await assigned.refresh()
    await untouched.refresh()
    assert.equal(unassigned.balance, allocation === 'unassigned' || allocation === 'pending' ? -37 : 0)
    assert.equal(assigned.balance, allocation === 'automatic' ? -37 : 0)
    assert.equal(untouched.balance, 0)
    assert.equal(funding.balance, allocation === 'before start' || allocation === 'pending' ? 175 : 212)
    for (const category of [unassigned, funding, assigned, untouched]) {
      assert.deepInclude(response.body().data.categories, { id: category.id, balance: category.balance })
    }
    assert.equal(response.body().data.accounts[0].balance, account.balance)
    assert.equal(response.body().data.accounts[0].plaidBalance, account.plaidBalance)
    assert.equal(response.body().data.accounts[0].pendingBalance, allocation === 'pending' ? -37 : 0)
    assert.lengthOf(await account.related('accountTransactions').query(), 2)
  })

  test('initial sync can invalidate copied account financial fields').with(['posted', 'pending']).run(async ({ client, assert }, state) => {
    const provider = providerAccount(accountId)
    provider.balances.current = state === 'posted' ? 175 : 100
    responses = [page([provider], 'c2', { added: [providerTransaction(accountId, 'purchase', {
      amount: 37, pending: state === 'pending',
      date: DateTime.now().startOf('month').plus({ days: 1 }).toISODate() ?? '',
    })] })]
    const response = await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })
    response.assertStatus(200)
    const institution = await Institution.query().where('budgetId', budget.id).firstOrFail()
    const account = await institution.related('accounts').query().firstOrFail()
    assert.equal(account.balance, state === 'posted' ? 175 : 100)
    assert.equal(account.plaidBalance, state === 'posted' ? 175 : 100)
    assert.equal(response.body().data.accounts[0].balance, account.balance)
    assert.equal(response.body().data.accounts[0].plaidBalance, account.plaidBalance)
    assert.equal(response.body().data.accounts[0].pendingBalance, state === 'pending' ? -37 : 0)
  })

  test('creation retry with an existing provider account rejects and rolls back new setup', async ({ client, assert }) => {
    responses = [new Error('Synthetic initial sync failure')]
    ;(await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })).assertStatus(200)
    const before = await snapshot()
    id = randomUUID()
    const response = await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-new-public', institutionId: 'test-bank' })
    response.assertStatus(409)
    assert.deepEqual(await snapshot(), before)
    assert.lengthOf(removed, 1)
  })

  test('provider-accepted reconnect with a different account ID creates another institution', async ({ client, assert }) => {
    responses = [new Error('Synthetic initial sync failure')]
    ;(await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })).assertStatus(200)
    accountId = `different-${id}`
    id = randomUUID()
    responses = [new Error('Synthetic initial sync failure')]
    ;(await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-new-public', institutionId: 'test-bank' })).assertStatus(200)
    assert.lengthOf(await Institution.query().where('budgetId', budget.id), 2)
    const institutions = await budget.related('institutions').query().preload('accounts')
    assert.deepEqual(institutions.map((institution) => institution.accounts.length), [1, 1])
  })

  test('exact request retry with a consumed public token fails exchange without removing the existing connection', async ({ client, assert }) => {
    responses = [new Error('Synthetic initial sync failure')]
    const payload = { publicToken: 'fake-public', institutionId: 'test-bank' }
    ;(await client.post('/api/v1/institution').loginAs(user).json(payload)).assertStatus(200)
    const before = await snapshot()
    ;(await client.post('/api/v1/institution').loginAs(user).json(payload)).assertStatus(500)
    assert.deepEqual(await snapshot(), before)
    assert.isEmpty(removed)
  })

  test('failed Item removal still rolls back local setup but cannot establish external cleanup', async ({ client, assert }) => {
    failure = 'cleanup removal'
    persistenceFailure('local account')
    const before = await snapshot()
    const response = await client.post('/api/v1/institution').loginAs(user).json({ publicToken: 'fake-public', institutionId: 'test-bank' })
    response.assertStatus(500)
    assert.deepEqual(await snapshot(), before)
    assert.lengthOf(removed, 1)
    assert.notInclude(JSON.stringify(response.body()), token)
  })
})
