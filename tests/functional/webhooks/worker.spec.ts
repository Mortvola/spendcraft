import { test } from '@japa/runner'
import { mock } from 'node:test'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import ace from '@adonisjs/core/services/ace'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import * as Plaid from 'plaid'
import type { ConnectionOptions, Processor, QueueOptions, WorkerOptions } from 'bullmq'
import { BullMQ } from '#providers/BullMQ'
import PlaidWrapper from '#providers/Plaid/Plaid'
import ApplePushNotifications from '#providers/ApplePushNotifications/index'
import QueueListener from '../../../commands/QueueListener.js'
import WebhookController from '#controllers/WebhookController'
import { QueueNamesEnum, type PlaidWebHookProps } from '#contracts/QueueInterfaces'
import Budget from '#models/Budget'
import Institution from '#models/Institution'
import Account from '#models/Account'
import { AccountType, TrackingType } from '#common/ResponseTypes'

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

class SyncFake extends PlaidWrapper {
  responses: (Plaid.TransactionsSyncResponse | Error)[] = []
  cursors: (string | null)[] = []

  async syncTransactions(_institution: Institution, cursor: string | null): Promise<Plaid.TransactionsSyncResponse> {
    this.cursors.push(cursor)
    const response = this.responses.shift()
    if (!response) throw new Error('Unexpected sync call: fake responses exhausted')
    if (response instanceof Error) throw response
    return response
  }
}

// Redirect the real producer and processor to one private queue. Drive BullMQ's
// actual locked-job processing explicitly, without polling or background timing.
class IsolatedBullMQ extends BullMQ {
  queueName = `spendcraft-worker-test-${randomUUID()}`
  processNext: (() => Promise<boolean>) | undefined
  closeWorker: (() => Promise<void>) | undefined
  closeQueues: (() => Promise<void>)[] = []
  resolved = 0
  rejected: unknown[] = []
  completed = 0
  failed: Error[] = []
  workerErrors: Error[] = []

  queue<T, R>(name: string, options?: QueueOptions) {
    if (name !== QueueNamesEnum.PlaidWebHook) throw new Error('Unexpected queue')
    const queue = super.queue<T, R>(this.queueName, options)
    this.closeQueues.push(() => queue.close())
    return queue
  }

  worker<T, R, N extends string = string>(name: string, callback: string | Processor<T, R, N>, options?: WorkerOptions) {
    if (name !== QueueNamesEnum.PlaidWebHook || typeof callback !== 'function') throw new Error('Unexpected processor')
    const worker = super.worker<T, R, N>(this.queueName, async (job, token, signal) => {
      try {
        const result = await callback(job, token, signal)
        this.resolved++
        return result
      } catch (error) {
        this.rejected.push(error)
        throw error
      }
    }, { ...options, connection: this.connection, autorun: false })
    worker.on('completed', () => { this.completed++ })
    worker.on('failed', (_job, error) => { this.failed.push(error) })
    worker.on('error', (error) => { this.workerErrors.push(error) })
    this.closeWorker = () => worker.close()
    this.processNext = async () => {
      await worker.waitUntilReady()
      const token = randomUUID()
      const job = await worker.getNextJob(token, { block: false })
      if (!job) return false
      await worker.processJob(job, token, () => false)
      return true
    }
    return worker
  }
}

class PushFake extends ApplePushNotifications {
  calls = 0
  error: Error | undefined
  async sendPushNotifications(_budget: Budget) {
    this.calls++
    if (this.error) throw this.error
  }
}

async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const id = randomUUID()
    const institution = await budget.related('institutions').create({ name: 'Worker bank', institutionId: id, accessToken: 'fake-token', plaidItemId: id, cursor: null })
    const account = await institution.related('accounts').create({
      name: 'Worker checking', plaidAccountId: id, balance: 100,
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, enabled: true, closed: false, initialized: true,
    })
    const unassigned = await budget.getUnassignedCategory({ client: trx })
    return { institution, account, unassigned, id }
  })
}

async function snapshot() {
  const result: Record<string, unknown[]> = {}
  for (const table of ['transactions', 'account_transactions', 'accounts', 'categories', 'statements', 'transaction_logs', 'institutions']) {
    result[table] = await db.from(table).orderBy('id')
  }
  return result
}

test.group('Plaid webhook worker', (group) => {
  let f: Awaited<ReturnType<typeof fixture>>
  let fake: SyncFake
  let push: PushFake
  let bull: IsolatedBullMQ
  let errors: ReturnType<typeof mock.method<typeof logger, 'error'>>

  group.each.setup(async () => {
    f = await fixture()
    fake = new SyncFake(app.config.get('plaid'))
    push = new PushFake()
    bull = new IsolatedBullMQ(app.config.get('bullmq'))
    // These tests may only use the configured local Redis, never a remote queue.
    const connection = app.config.get<ConnectionOptions>('bullmq')
    if (!('host' in connection) || !connection.host || !['localhost', '127.0.0.1'].includes(connection.host)) throw new Error('Worker tests require local Redis')
    app.container.swap(PlaidWrapper, () => fake)
    app.container.swap(ApplePushNotifications, () => push)
    app.container.swap(BullMQ, () => bull)
    errors = mock.method(logger, 'error')
    return async () => {
      errors.mock.restore()
      app.container.restore(PlaidWrapper)
      app.container.restore(ApplePushNotifications)
      app.container.restore(BullMQ)
      await bull.closeWorker?.()
      const queue = bull.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
      try {
        await queue.obliterate({ force: true })
        const client = await queue.backend.client
        let cursor = '0'
        do {
          const [next, keys] = await client.scan(cursor, { MATCH: `bull:${bull.queueName}:*` })
          if (keys.length) throw new Error('Temporary worker queue was not cleaned up')
          cursor = next
        } while (cursor !== '0')
      } finally {
        await Promise.all(bull.closeQueues.map((close) => close()))
      }
    }
  })

  async function enqueue(itemId: string = f.id) {
    await WebhookController.syncUpdate({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: itemId, environment: Plaid.WebhookEnvironmentValues.Sandbox, initial_update_complete: true, historical_update_complete: true })
    const queue = bull.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
    try {
      const [job] = await queue.getJobs(['waiting'])
      if (!job) throw new Error('Webhook did not enqueue a job')
      return job
    } finally {
      await queue.close()
    }
  }

  async function process() {
    if (!bull.processNext) {
      const command = await ace.create(QueueListener, [])
      await command.run()
    }
    if (!bull.processNext) throw new Error('Listener did not register a worker')
    return bull.processNext()
  }

  // Job methods need an open queue connection; read durable state through a fresh queue.
  async function persistedJob(id: string | undefined) {
    if (!id) throw new Error('Job lacks ID')
    const queue = bull.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
    try {
      const job = await queue.getJob(id)
      if (!job) throw new Error('Job was unexpectedly removed')
      return { state: await job.getState(), attemptsMade: job.attemptsMade, failedReason: job.failedReason, returnvalue: job.returnvalue }
    } finally {
      await queue.close()
    }
  }

  const successfulPage = () => page([providerAccount(f.id)], 'c1', { added: [providerTransaction(f.id, 'purchase')] })

  test('successful queued sync commits and completes with no configured retries', async ({ assert }) => {
    fake.responses = [successfulPage()]
    const job = await enqueue()
    assert.equal(job.opts.attempts, 0)
    assert.isUndefined(job.opts.backoff)
    assert.isUndefined(job.opts.removeOnComplete)
    assert.isUndefined(job.opts.removeOnFail)
    assert.isTrue(await process())
    const stored = await persistedJob(job.id)
    assert.equal(stored.state, 'completed')
    assert.deepEqual(stored.returnvalue, { itemId: f.id })
    assert.equal(bull.resolved, 1)
    assert.equal(bull.completed, 1)
    assert.isEmpty(bull.failed)
    assert.isEmpty(bull.workerErrors)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 90)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -10)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c1')
    assert.equal(push.calls, 1)
  })

  test('sync error is logged and propagated unchanged to a retained failed job without automatic retry', async ({ assert }) => {
    const error = new Error('deterministic provider failure')
    fake.responses = [error]
    const before = await snapshot()
    const job = await enqueue()
    await process()
    assert.deepEqual(await snapshot(), before)
    assert.equal(push.calls, 0)
    assert.isTrue(errors.mock.calls.some(({ arguments: args }) => {
      const payload: unknown = args[0]
      return args[1] === `sync update failed, item id: ${f.id}` && typeof payload === 'object' && payload !== null && 'err' in payload && payload.err === error
    }))
    assert.strictEqual(bull.rejected[0], error)
    assert.equal(bull.completed, 0)
    assert.strictEqual(bull.failed[0], error)
    const stored = await persistedJob(job.id)
    assert.equal(stored.state, 'failed')
    assert.equal(stored.failedReason, error.message)
    assert.equal(stored.attemptsMade, 1)
    assert.isFalse(await process())
    assert.deepEqual(fake.cursors, [null])
    assert.isEmpty(bull.workerErrors)
  })

  test('later-page failure rolls back financial state and cursor before a separately delivered job succeeds once', async ({ assert }) => {
    const error = new Error('second page failed')
    fake.responses = [{ ...successfulPage(), has_more: true }, error]
    const before = await snapshot()
    const failed = await enqueue()
    await process()
    assert.deepEqual(fake.cursors, [null, 'c1'])
    assert.deepEqual(await snapshot(), before)
    assert.equal((await persistedJob(failed.id)).state, 'failed')
    assert.equal(push.calls, 0)
    fake.responses = [successfulPage()]
    const next = await enqueue()
    await process()
    assert.equal((await persistedJob(next.id)).state, 'completed')
    assert.deepEqual(fake.cursors, [null, 'c1', null])
    assert.equal((await Account.findOrFail(f.account.id)).balance, 90)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -10)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c1')
    assert.lengthOf(await f.account.related('accountTransactions').query(), 1)
    assert.lengthOf(await db.from('transaction_logs').where('application_id', f.institution.budgetId), 1)
    assert.equal(push.calls, 1)
  })


  test('real provider transport failure on page two rejects the worker and rolls back financial state').with(['ECONNRESET', 'ECONNABORTED']).run(async ({ assert, cleanup }, code) => {
    const original = Object.assign(new Error(`Provider transport ${code}`), { code, config: { headers: { 'PLAID-SECRET': 'fake-secret' } } })
    const wrapper = new PlaidWrapper(app.config.get('plaid'))
    let calls = 0
    const sdk = mock.method(wrapper.plaid, 'transactionsSync', async () => {
      if (calls++ === 0) return { data: { ...successfulPage(), has_more: true }, status: 200, statusText: 'OK', headers: {}, config: { headers: new Headers() }, request: { path: '/transactions/sync' } }
      throw original
    })
    const audit = mock.method(PlaidWrapper, 'log', async () => { /* Isolate SDK behavior from provider audit persistence. */ })
    cleanup(() => { sdk.mock.restore(); audit.mock.restore() })
    app.container.swap(PlaidWrapper, () => wrapper)
    const before = await snapshot()
    const job = await enqueue()
    await process()
    assert.equal(calls, 2)
    assert.deepEqual(await snapshot(), before)
    const error = bull.rejected[0]
    assert.instanceOf(error, Error)
    if (!(error instanceof Error)) throw new Error('Expected worker rejection')
    assert.strictEqual(error.cause, original)
    assert.equal(error.message, original.message)
    assert.equal('code' in error ? error.code : undefined, code)
    assert.notInclude(JSON.stringify(error), 'fake-secret')
    assert.equal(bull.completed, 0)
    assert.strictEqual(bull.failed[0], error)
    assert.equal(push.calls, 0)
    const stored = await persistedJob(job.id)
    assert.equal(stored.state, 'failed')
    assert.equal(stored.failedReason, original.message)
    assert.equal(stored.attemptsMade, 1)
    assert.isFalse(await process())
    assert.equal(calls, 2)
  })

  test('missing institution fails the job without contacting Plaid or mutating financial state', async ({ assert }) => {
    const before = await snapshot()
    const job = await enqueue('missing-item')
    await process()
    assert.deepEqual(await snapshot(), before)
    assert.equal((await persistedJob(job.id)).state, 'failed')
    assert.isEmpty(fake.cursors)
    assert.equal(push.calls, 0)
  })

  test('post-commit push failure is logged but does not fail successful synchronization', async ({ assert }) => {
    fake.responses = [successfulPage()]
    push.error = new Error('push failure')
    const job = await enqueue()
    await process()
    assert.equal((await persistedJob(job.id)).state, 'completed')
    assert.equal((await Account.findOrFail(f.account.id)).balance, 90)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c1')
    assert.equal(push.calls, 1)
    assert.isTrue(errors.mock.calls.some(({ arguments: args }) => args[1] === 'push notification failed'))
    assert.isEmpty(bull.failed)
  })
})
