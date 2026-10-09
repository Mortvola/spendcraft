import { test } from '@japa/runner'
import { mock } from 'node:test'
import { randomUUID } from 'node:crypto'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import redis from '@adonisjs/redis/services/main'
import { sha256 } from 'js-sha256'
import type { ConnectionOptions, QueueOptions } from 'bullmq'
import PlaidWrapper, { type WebhookVerificationKeyGetResponse } from '#providers/Plaid/Plaid'
import { BullMQ } from '#providers/BullMQ'
import { QueueNamesEnum, type PlaidWebHookProps } from '#contracts/QueueInterfaces'
import WebhookLog from '#models/WebhookLog'

class EnqueueQueue extends BullMQ {
  name = `spendcraft-enqueue-test-${randomUUID()}`
  failure: 'reject' | 'throw' | undefined
  error = new Error('Deterministic enqueue failure')
  calls = 0
  closes: (() => Promise<void>)[] = []

  queue<T, R>(name: string, options?: QueueOptions) {
    if (name !== QueueNamesEnum.PlaidWebHook) throw new Error('Unexpected queue')
    const queue = super.queue<T, R>(this.name, options)
    const add = queue.add.bind(queue)
    mock.method(queue, 'add', (...args: Parameters<typeof add>) => {
      this.calls++
      if (this.failure === 'throw') throw this.error
      if (this.failure === 'reject') return Promise.reject(this.error)
      return add(...args)
    })
    this.closes.push(() => queue.close())
    return queue
  }
}

async function financialState() {
  const result: Record<string, unknown[]> = {}
  for (const table of ['transactions', 'account_transactions', 'accounts', 'categories', 'statements', 'transaction_logs', 'institutions']) {
    result[table] = await db.from(table).orderBy('id')
  }
  return result
}

test.group('Webhook durable enqueue acknowledgment', (group) => {
  let bull: EnqueueQueue
  let keys: Awaited<ReturnType<typeof generateKeyPair>>
  let kid: string
  let syncCalls: number
  let errors: ReturnType<typeof mock.method<typeof logger, 'error'>>
  let warnings: ReturnType<typeof mock.method<typeof logger, 'warn'>>
  const syncBody = { webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'fake-item', environment: 'sandbox', initial_update_complete: true, historical_update_complete: true }

  group.each.setup(async () => {
    const connection = app.config.get<ConnectionOptions>('bullmq')
    if (!('host' in connection) || !connection.host || !['localhost', '127.0.0.1'].includes(connection.host)) throw new Error('Enqueue tests require local Redis')
    bull = new EnqueueQueue(connection)
    keys = await generateKeyPair('RS256', { modulusLength: 2048 })
    kid = randomUUID()
    const jwk = await exportJWK(keys.publicKey)
    syncCalls = 0
    class PlaidFake extends PlaidWrapper {
      async getWebhookVerificationKey(): Promise<WebhookVerificationKeyGetResponse> {
        return { key: { ...jwk, alg: 'RS256', crv: '', kid, kty: jwk.kty ?? '', use: 'sig', x: '', y: '', created_at: Math.floor(Date.now() / 1000), expired_at: null }, request_id: 'fake-key' }
      }
      async syncTransactions(): Promise<never> {
        syncCalls++
        throw new Error('HTTP handler must not synchronize inline')
      }
    }
    app.container.swap(PlaidWrapper, () => new PlaidFake(app.config.get('plaid')))
    app.container.swap(BullMQ, () => bull)
    errors = mock.method(logger, 'error')
    warnings = mock.method(logger, 'warn')
    return async () => {
      errors.mock.restore()
      warnings.mock.restore()
      app.container.restore(PlaidWrapper)
      app.container.restore(BullMQ)
      await redis.del(`plaid_wh_key:${kid}`)
      const queue = bull.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
      try {
        await queue.obliterate({ force: true })
        const client = await queue.backend.client
        let cursor = '0'
        do {
          const [next, remaining] = await client.scan(cursor, { MATCH: `bull:${bull.name}:*` })
          if (remaining.length) throw new Error('Temporary enqueue queue was not cleaned up')
          cursor = next
        } while (cursor !== '0')
      } finally {
        await Promise.all(bull.closes.map((close) => close()))
      }
    }
  })

  async function token(body: object, age = 0) {
    return new SignJWT({ request_body_sha256: sha256(JSON.stringify(body)) })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt(Math.floor(Date.now() / 1000) - age)
      .sign(keys.privateKey)
  }

  async function jobs() {
    const queue = bull.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
    try {
      const queued = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'])
      return queued.map((job) => ({ name: job.name, data: job.data }))
    } finally {
      await queue.close()
    }
  }

  test('valid sync webhook acknowledges a durable waiting job without inline financial work', async ({ client, assert }) => {
    const before = await financialState()
    const response = await client.post('/wh').json(syncBody).header('Plaid-Verification', await token(syncBody))
    response.assertStatus(204)
    assert.equal(bull.calls, 1)
    assert.deepEqual(await jobs(), [{ name: 'sync', data: { itemId: syncBody.item_id } }])
    assert.equal(syncCalls, 0)
    assert.deepEqual(await financialState(), before)
    assert.isEmpty(errors.mock.calls)
  })

  test('enqueue failure is logged and returns 500 without a job or inline fallback').with(['reject', 'throw'] as const).run(async ({ client, assert }, failure) => {
    bull.failure = failure
    const before = await financialState()
    const response = await client.post('/wh').json(syncBody).header('Plaid-Verification', await token(syncBody))
    assert.equal(bull.calls, 1)
    assert.isEmpty(await jobs())
    assert.equal(syncCalls, 0)
    assert.deepEqual(await financialState(), before)
    assert.isTrue(errors.mock.calls.some(({ arguments: args }) => {
      const payload: unknown = args[0]
      return typeof args[1] === 'string' && args[1].startsWith('Posting sync to queue failed') && typeof payload === 'object' && payload !== null && 'err' in payload && payload.err === bull.error
    }))
    response.assertStatus(500)
  })

  test('expired JWT rejects before enqueue', async ({ client, assert }) => {
    const response = await client.post('/wh').json(syncBody).header('Plaid-Verification', await token(syncBody, 600))
    response.assertStatus(400)
    assert.equal(bull.calls, 0)
    assert.isEmpty(await jobs())
    assert.equal(syncCalls, 0)
    assert.isTrue(errors.mock.calls.some(({ arguments: args }) => typeof args[0] === 'string' && args[0].startsWith('token verification failed:')))
  })

  test('invalid body hash rejects before enqueue', async ({ client, assert }) => {
    const response = await client.post('/wh').json(syncBody).header('Plaid-Verification', await token({ ...syncBody, item_id: 'different-item' }))
    response.assertStatus(400)
    assert.equal(bull.calls, 0)
    assert.isEmpty(await jobs())
    assert.equal(syncCalls, 0)
  })

  test('irrelevant valid webhook is acknowledged without enqueue', async ({ client, assert }) => {
    const body = { webhook_type: 'TEST' }
    const response = await client.post('/wh').json(body).header('Plaid-Verification', await token(body))
    response.assertStatus(204)
    assert.equal(bull.calls, 0)
    assert.isEmpty(await jobs())
    assert.equal(syncCalls, 0)
    assert.isTrue(warnings.mock.calls.some(({ arguments: args }) => args[0] === 'Unhandled webhook type: TEST'))
  })

  test('log persistence failure before enqueue returns 500 without a job', async ({ client, assert, cleanup }) => {
    const save = mock.method(WebhookLog.prototype, 'save', () => Promise.reject(new Error('Webhook log write failed')))
    cleanup(() => save.mock.restore())
    const response = await client.post('/wh').json(syncBody).header('Plaid-Verification', await token(syncBody))
    response.assertStatus(500)
    assert.equal(bull.calls, 0)
    assert.isEmpty(await jobs())
    assert.equal(syncCalls, 0)
  })

  test('log cleanup failure after enqueue returns 500 but preserves the queued job', async ({ client, assert, cleanup }) => {
    const original = WebhookLog.query.bind(WebhookLog)
    const query = mock.method(WebhookLog, 'query', (...args: Parameters<typeof original>) => {
      if (bull.calls > 0) throw new Error('Webhook log cleanup failed')
      return original(...args)
    })
    cleanup(() => query.mock.restore())
    const response = await client.post('/wh').json(syncBody).header('Plaid-Verification', await token(syncBody))
    response.assertStatus(500)
    assert.equal(bull.calls, 1)
    assert.deepEqual(await jobs(), [{ name: 'sync', data: { itemId: syncBody.item_id } }])
    assert.equal(syncCalls, 0)
  })
})
