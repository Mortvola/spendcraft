import { test } from '@japa/runner'
import { mock } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import ace from '@adonisjs/core/services/ace'
import db from '@adonisjs/lucid/services/db'
import { Logger } from '@adonisjs/core/logger'
import Cleanup from '#models/PlaidItemCleanup'
import Service from '#services/plaidItemCleanup'
import PlaidWrapper, { type PlaidConfig } from '#providers/Plaid/Plaid'
import PlaidException from '#providers/Plaid/PlaidException'
import { BullMQ } from '#providers/BullMQ'
import CleanupCommand from '../../../commands/PlaidCleanup.js'
import CleanupListener from '../../../commands/PlaidCleanupListener.js'

const secret = 'SYNTHETIC_ADVERSARIAL_CREDENTIAL_DO_NOT_DISCLOSE'

function deferred() {
  let resolve: () => void = () => { throw new Error('Deferred not initialized') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test.group('Plaid cleanup adversarial review', (group) => {
  let service: Service
  let provider: PlaidWrapper
  let calls: number
  let start: ReturnType<typeof deferred>
  let finish: ReturnType<typeof deferred> | undefined
  let failure: unknown
  group.each.setup(async () => {
    await Cleanup.query().delete()
    const encryption = { ...app.config.get<{ activeKey: string, keys: string }>('plaidCleanup') }
    const plaid = { ...app.config.get<PlaidConfig>('plaid') }
    app.config.set('plaidCleanup', { activeKey: 'review-v1', keys: JSON.stringify({ 'review-v1': randomBytes(32).toString('base64') }) })
    app.config.set('plaid', { environment: 'sandbox', clientId: 'synthetic-review-client', sandboxSecret: 'synthetic-provider-secret', productionSecret: '' })
    provider = new PlaidWrapper(app.config.get('plaid'))
    app.container.swap(PlaidWrapper, () => provider)
    service = new Service()
    calls = 0
    start = deferred()
    finish = undefined
    failure = undefined
    const removal = mock.method(provider, 'removeItem', async () => {
      calls++
      start.resolve()
      if (finish) await finish.promise
      if (failure) throw failure
      return { request_id: 'synthetic-review' }
    })
    return () => {
      removal.mock.restore()
      app.container.restore(PlaidWrapper)
      app.config.set('plaidCleanup', encryption)
      app.config.set('plaid', plaid)
    }
  })
  const protect = () => service.protect(randomUUID(), secret)

  test('malformed IDs never reach SQL or echo hostile input in exceptions').with(['attempt', 'retry', 'extend', 'setup']).run(async ({ assert }, action) => {
    let error: unknown
    const trx = action === 'setup' ? await db.transaction() : undefined
    try {
      if (action === 'attempt') await service.attempt(secret)
      else if (action === 'setup' && trx) await service.lockSetup(secret, trx)
      else await service.administer(secret, action === 'extend' ? 'extend' : 'retry')
    } catch (caught) { error = caught }
    finally { if (trx) await trx.rollback() }
    assert.instanceOf(error, Error)
    assert.notInclude(String(error), secret)
    assert.equal(calls, 0)
  })

  test('resolved provider context must agree with the recorded context', async ({ assert, cleanup }) => {
    const row = await protect()
    const wrong = new PlaidWrapper({ environment: 'sandbox', clientId: 'different-synthetic-client', sandboxSecret: 'other-synthetic-secret', productionSecret: '' })
    let wrongCalls = 0
    const removal = mock.method(wrong, 'removeItem', async () => { wrongCalls++; return { request_id: 'wrong-context' } })
    cleanup(() => removal.mock.restore())
    app.container.swap(PlaidWrapper, () => wrong)
    await service.attempt(row.id, true)
    assert.equal(wrongCalls, 0)
    await row.refresh()
    assert.equal(row.status, 'review_required')
    assert.isNotNull(row.encryptedAccessToken)
  })

  test('ciphertext swapping and identity substitution fail closed').with(['swap', 'item', 'version', 'context']).run(async ({ assert }, attack) => {
    const row = await protect()
    if (attack === 'swap') row.encryptedAccessToken = (await protect()).encryptedAccessToken
    if (attack === 'item') row.itemId = randomUUID()
    if (attack === 'version') row.keyVersion = 'unavailable-v2'
    if (attack === 'context') row.providerContext = 'production:different-client'
    await row.save()
    await service.attempt(row.id, true)
    await row.refresh()
    assert.equal(calls, 0)
    assert.equal(row.status, 'review_required')
    assert.notInclude(JSON.stringify(row.toJSON()), secret)
    assert.notProperty(row.toJSON(), 'encryptedAccessToken')
  })

  test('replacing an old key never silently falls back', async ({ assert }) => {
    const row = await protect()
    app.config.set('plaidCleanup.keys', JSON.stringify({ 'review-v1': randomBytes(32).toString('base64') }))
    await service.attempt(row.id, true)
    assert.equal(calls, 0)
    assert.equal((await row.refresh()).lastErrorClass, 'decryption_failed')
  })

  test('malformed or unavailable active-key configuration fails readiness safely').with(['not-json', '[]', '{}', '{"review-v1":"short"}']).run(async ({ assert }, config) => {
    app.config.set('plaidCleanup.keys', config)
    let error: unknown
    try { await service.ready() } catch (caught) { error = caught }
    assert.instanceOf(error, Error)
    assert.equal(String(error), 'Error: Plaid cleanup encryption unavailable')
    assert.equal(calls, 0)
  })

  test('terminal state constraint rejects credentials').with(['cancelled', 'completed']).run(async ({ assert }, status) => {
    const row = await protect()
    await assert.rejects(() => db.from('plaid_item_cleanups').where('id', row.id).update({ status }))
    await row.refresh()
    assert.equal(row.status, 'protected')
    assert.isNotNull(row.encryptedAccessToken)
  })

  test('terminal cleanup cannot automatically or administratively revive').with(['cancelled', 'completed']).run(async ({ assert }, status) => {
    const row = await protect()
    if (status === 'cancelled') await db.transaction(async (trx) => service.cancelSetup(await service.lockSetup(row.id, trx)))
    else await service.attempt(row.id, true)
    const before = row.toJSON()
    await row.refresh()
    const terminal = row.toJSON()
    const previousCalls = calls
    await service.attempt(row.id, true)
    await assert.rejects(() => service.administer(row.id, 'retry'))
    await assert.rejects(() => service.administer(row.id, 'extend', 30))
    assert.deepEqual((await row.refresh()).toJSON(), terminal)
    assert.equal(calls, previousCalls)
    assert.notInclude(JSON.stringify(before), secret)
  })

  test('review state and expired credentials cannot retry automatically', async ({ assert }) => {
    const row = await protect()
    row.status = 'review_required'
    row.credentialExpiresAt = DateTime.utc().plus({ days: 1 })
    await row.save()
    await service.attempt(row.id, true)
    assert.equal(calls, 0)
    row.credentialExpiresAt = DateTime.utc().minus({ days: 1 }); await row.save()
    await assert.rejects(() => service.administer(row.id, 'retry'))
    await service.attempt(row.id)
    await assert.rejects(() => service.administer(row.id, 'extend', 30))
    assert.isNull((await row.refresh()).encryptedAccessToken)
  })

  test('concurrent administrative retries permit one transition', async ({ assert }) => {
    const row = await protect()
    row.status = 'review_required'; row.credentialExpiresAt = DateTime.utc().plus({ days: 1 }); await row.save()
    const results = await Promise.allSettled([service.administer(row.id, 'retry'), service.administer(row.id, 'retry')])
    assert.lengthOf(results.filter((result) => result.status === 'fulfilled'), 1)
    await Promise.all([service.attempt(row.id), service.attempt(row.id)])
    assert.equal(calls, 1)
    assert.equal((await row.refresh()).attemptCount, 1)
  })

  test('active removal excludes expiry and duplicate jobs without consuming more attempts', async ({ assert }) => {
    const row = await protect()
    row.credentialExpiresAt = DateTime.utc().plus({ days: 1 }); await row.save()
    finish = deferred()
    const running = service.attempt(row.id, true)
    await start.promise
    try {
      await row.refresh()
      assert.equal(row.attemptCount, 1)
      assert.isNotNull(row.encryptedAccessToken)
      row.credentialExpiresAt = DateTime.utc().minus({ seconds: 1 }); await row.save()
      await Promise.all([service.attempt(row.id), service.attempt(row.id, true)])
      assert.equal(calls, 1)
      assert.isNotNull((await row.refresh()).encryptedAccessToken)
    } finally { finish.resolve(); await running }
    assert.equal((await row.refresh()).status, 'completed')
    assert.isNull(row.encryptedAccessToken)
  })

  test('setup losing the claim race rejects before it can attach an Item', async ({ assert }) => {
    const row = await protect()
    finish = deferred()
    const running = service.attempt(row.id, true)
    await start.promise
    const trx = await db.transaction()
    try { await assert.rejects(() => service.lockSetup(row.id, trx)) }
    finally { await trx.rollback(); finish.resolve(); await running }
    assert.equal(calls, 1)
  })

  test('aborted setup releases row lock and abandoned protection converges', async ({ assert }) => {
    const row = await protect()
    row.nextAttemptAt = DateTime.utc().minus({ minutes: 1 }); await row.save()
    const trx = await db.transaction()
    await service.lockSetup(row.id, trx)
    const running = service.attempt(row.id)
    await trx.rollback()
    await running
    assert.equal(calls, 1)
    assert.equal((await row.refresh()).status, 'completed')
  })

  test('safe classification and real structured logging exclude provider credential strings', async ({ assert, cleanup }) => {
    const rows: string[] = []
    const capture = new Logger({ enabled: true, level: 'error', destination: { write: (line: string) => { rows.push(line) } } })
    const original = Logger.prototype.error
    const logging = mock.method(Logger.prototype, 'error', function (...args: Parameters<Logger['error']>) { original.apply(capture, args) })
    cleanup(() => logging.mock.restore())
    const row = await protect()
    failure = new PlaidException({ response: { status: 400, data: { error_type: secret, error_code: secret, error_message: secret } } })
    await service.attempt(row.id, true)
    assert.notInclude(rows.join(''), secret)
    assert.notInclude(JSON.stringify((await row.refresh()).toJSON()), secret)
  })

  test('Ace list and hostile retention arguments never reveal stored credentials', async ({ assert, cleanup }) => {
    const row = await protect()
    row.status = 'review_required'; row.credentialExpiresAt = DateTime.utc().plus({ days: 1 }); await row.save()
    const command = await ace.create(CleanupCommand, ['list'])
    const output: string[] = []
    const logging = mock.method(command.logger, 'info', (value: string) => { output.push(value) })
    cleanup(() => logging.mock.restore())
    await command.run()
    assert.notInclude(output.join(''), secret)
    assert.notInclude(output.join(''), row.encryptedAccessToken ?? 'missing ciphertext')
    for (const days of [-1, 0, 366, Infinity, 1.5]) await assert.rejects(() => service.administer(row.id, 'extend', days))
    await assert.rejects(() => service.administer(randomUUID(), 'retry'))
    assert.equal(calls, 0)
  })

  test('stale duplicate sweep jobs cannot revive terminal state', async ({ assert, cleanup }) => {
    const row = await protect()
    row.nextAttemptAt = DateTime.utc().minus({ minutes: 1 }); await row.save()
    const original = await app.container.make('bullmq')
    const isolated = new BullMQ(original.connection)
    const name = `cleanup-review-${randomUUID()}`
    const inspect = isolated.queue<{ cleanupId: string }, null>(name)
    const routing = mock.method(isolated, 'queue', () => original.queue<{ cleanupId: string }, null>(name))
    app.container.swap(BullMQ, () => isolated)
    cleanup(async () => { routing.mock.restore(); app.container.restore(BullMQ); await inspect.obliterate({ force: true }); await inspect.close() })
    await Promise.all([service.sweep(), service.sweep()])
    const jobs = await inspect.getWaiting()
    assert.lengthOf(jobs, 2)
    for (const job of jobs) {
      assert.deepEqual(job.data, { cleanupId: row.id })
      assert.notInclude(JSON.stringify(job.asJSON()), secret)
    }
    await service.attempt(row.id, true)
    await Promise.all(jobs.map((job) => service.attempt(job.data.cleanupId)))
    assert.equal(calls, 1)
    assert.equal((await row.refresh()).attemptCount, 1)
  })
  test('authenticated provider and Item identities cannot be substituted through delimiter ambiguity', async ({ assert, cleanup }) => {
    const row = await service.protect('segment:synthetic-item', secret)
    row.providerContext = 'sandbox:synthetic-review-client:segment'
    row.itemId = 'synthetic-item'
    await row.save()
    const config: PlaidConfig = { environment: 'sandbox', clientId: 'synthetic-review-client:segment', sandboxSecret: 'synthetic-provider-secret', productionSecret: '' }
    app.config.set('plaid', config)
    const matching = new PlaidWrapper(config)
    let substitutedCalls = 0
    const removal = mock.method(matching, 'removeItem', async () => { substitutedCalls++; return { request_id: 'substitution' } })
    cleanup(() => removal.mock.restore())
    app.container.swap(PlaidWrapper, () => matching)
    await service.attempt(row.id, true)
    assert.equal(substitutedCalls, 0)
    assert.equal((await row.refresh()).lastErrorClass, 'decryption_failed')
  })

  test('crash before or after ledger commit converges from durable state').with(['before commit', 'after commit']).run(async ({ assert, cleanup }, stage) => {
    const row = await protect()
    const originalSave = Cleanup.prototype.save
    const restores: (() => void)[] = []
    const interrupted = mock.method(Cleanup.prototype, 'save', async function (this: Cleanup) {
      const result = await originalSave.call(this)
      if (this.status === 'pending' && this.attemptCount === 1) {
        if (stage === 'before commit') throw new Error('Synthetic interruption before ledger commit')
        const trx = this.$trx
        if (!trx) throw new Error('Expected ledger transaction')
        const originalCommit = trx.commit
        const commit = mock.method(trx, 'commit', async () => { await originalCommit.call(trx); throw new Error('Synthetic interruption after ledger commit') })
        restores.push(() => commit.mock.restore())
      }
      return result
    })
    cleanup(() => { interrupted.mock.restore(); restores.forEach((restore) => restore()) })
    await assert.rejects(() => service.attempt(row.id, true))
    interrupted.mock.restore()
    restores.forEach((restore) => restore())
    await row.refresh()
    assert.equal(calls, 0)
    assert.equal(row.attemptCount, stage === 'before commit' ? 0 : 1)
    assert.equal(row.status, stage === 'before commit' ? 'protected' : 'pending')
    assert.isNotNull(row.encryptedAccessToken)
    row.nextAttemptAt = DateTime.utc().minus({ seconds: 1 }); await row.save()
    await new Service().attempt(row.id)
    assert.equal(calls, 1)
    assert.equal((await row.refresh()).status, 'completed')
    assert.equal(row.attemptCount, stage === 'before commit' ? 1 : 2)
  })

  test('retention extension currently resets a deadline relative to now', async ({ assert }) => {
    const row = await protect()
    row.status = 'review_required'; row.credentialExpiresAt = DateTime.utc().plus({ days: 30 }); await row.save()
    const previousDeadline = row.credentialExpiresAt.toMillis()
    await service.administer(row.id, 'extend', 1)
    await row.refresh()
    assert.isBelow(row.credentialExpiresAt?.toMillis() ?? 0, previousDeadline)
    assert.isAbove(row.credentialExpiresAt?.toMillis() ?? 0, Date.now())
  })

  test('duplicate JSON key versions choose the last key but cannot decrypt old data', async ({ assert }) => {
    const row = await protect()
    const keys: unknown = JSON.parse(app.config.get<string>('plaidCleanup.keys'))
    if (typeof keys !== 'object' || keys === null) throw new Error('Expected test keys')
    const original: unknown = Reflect.get(keys, 'review-v1')
    if (typeof original !== 'string') throw new Error('Expected test key')
    app.config.set('plaidCleanup.keys', `{"review-v1":${JSON.stringify(original)},"review-v1":${JSON.stringify(randomBytes(32).toString('base64'))}}`)
    await service.ready()
    await service.attempt(row.id, true)
    assert.equal(calls, 0)
    assert.equal((await row.refresh()).lastErrorClass, 'decryption_failed')
  })

  test('nonce/tag tampering and an aliased key version cannot decrypt').with(['tampered', 'aliased version', 'legacy binding']).run(async ({ assert }, attack) => {
    const row = await protect()
    if (attack === 'tampered') {
      const cipher = row.encryptedAccessToken
      if (!cipher) throw new Error('Expected ciphertext')
      const index = Math.floor(cipher.length / 2)
      row.encryptedAccessToken = cipher.slice(0, index) + (cipher[index] === 'A' ? 'B' : 'A') + cipher.slice(index + 1)
    } else if (attack === 'legacy binding') {
      row.encryptedAccessToken = row.encryptedAccessToken?.replace('binding-v2:', '') ?? null
    } else {
      const keys: unknown = JSON.parse(app.config.get<string>('plaidCleanup.keys'))
      if (typeof keys !== 'object' || keys === null) throw new Error('Expected test keys')
      const key: unknown = Reflect.get(keys, 'review-v1')
      if (typeof key !== 'string') throw new Error('Expected test key')
      app.config.set('plaidCleanup.keys', JSON.stringify({ 'review-v1': key, 'review-v2': key }))
      row.keyVersion = 'review-v2'
    }
    await row.save()
    await service.attempt(row.id, true)
    assert.equal(calls, 0)
    assert.equal((await row.refresh()).lastErrorClass, 'decryption_failed')
  })

  test('expiry and administrative extension serialize without corrupting state').with(['extension first', 'expiry first']).run(async ({ assert }, order) => {
    const row = await protect()
    row.status = 'review_required'; row.credentialExpiresAt = DateTime.utc().minus({ days: 1 }); await row.save()
    const blocker = await db.transaction()
    await Cleanup.query({ client: blocker }).where('id', row.id).forUpdate().firstOrFail()
    const wait = async (count: number) => {
      for (let i = 0; i < 100; i++) {
        const state = await db.rawQuery("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%plaid_item_cleanups%'")
        if (state.rows[0].count >= count) return
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      throw new Error('Expected retention row-lock wait')
    }
    let first: Promise<unknown> | undefined
    let second: Promise<unknown> | undefined
    try {
      first = order === 'extension first' ? service.administer(row.id, 'extend', 30) : service.attempt(row.id)
      // Attach handlers before releasing the lock to avoid an expected admin rejection becoming unhandled.
      first = first.then(() => 'ok', () => 'rejected')
      await wait(1)
      second = order === 'extension first' ? service.attempt(row.id) : service.administer(row.id, 'extend', 30)
      second = second.then(() => 'ok', () => 'rejected')
      await wait(2)
    } finally { await blocker.rollback() }
    const results = await Promise.all([first, second])
    await row.refresh()
    assert.equal(calls, 0)
    if (order === 'extension first') {
      assert.deepEqual(results, ['ok', 'ok'])
      assert.isNotNull(row.encryptedAccessToken)
      assert.isAbove(row.credentialExpiresAt?.toMillis() ?? 0, Date.now())
    } else {
      assert.deepEqual(results, ['ok', 'rejected'])
      assert.isNull(row.encryptedAccessToken)
    }
  })

  test('Ace retry/extend reject malformed IDs without echoing their values').with(['retry', 'extend']).run(async ({ assert }, action) => {
    const command = await ace.create(CleanupCommand, [action, secret])
    let error: unknown
    try { await command.run() } catch (caught) { error = caught }
    assert.instanceOf(error, Error)
    assert.equal(String(error), 'Error: Invalid Plaid cleanup ID')
    assert.notInclude(String(error), secret)
    assert.equal(calls, 0)
  })

  test('completion before failed BullMQ acknowledgment makes redelivery harmless', async ({ assert, cleanup }) => {
    const row = await protect()
    row.nextAttemptAt = DateTime.utc().minus({ seconds: 1 }); await row.save()
    const bull = await app.container.make('bullmq')
    const name = `cleanup-ack-review-${randomUUID()}`
    const queue = bull.queue<{ cleanupId: string }, null>(name)
    const worker = bull.worker<{ cleanupId: string }, null>(name, async (job) => {
      await service.attempt(job.data.cleanupId)
      throw new Error('Synthetic failure after database completion')
    }, { connection: bull.connection, autorun: false })
    cleanup(async () => { await worker.close(); await queue.obliterate({ force: true }); await queue.close() })
    await queue.add('cleanup', { cleanupId: row.id })
    await worker.waitUntilReady()
    const lock = randomUUID()
    const job = await worker.getNextJob(lock, { block: false })
    if (!job) throw new Error('Expected isolated cleanup job')
    await worker.processJob(job, lock, () => false)
    const persisted = await queue.getJob(job.id ?? '')
    if (!persisted) throw new Error('Expected failed isolated job')
    assert.equal(await persisted.getState(), 'failed')
    assert.notInclude(JSON.stringify(persisted.asJSON()), secret)
    assert.equal((await row.refresh()).status, 'completed')
    await service.attempt(row.id)
    assert.equal(calls, 1)
    assert.equal(row.attemptCount, 1)
  })

  test('listener retries startup analysis failures and suppresses overlapping sweeps').with(['missing migration', 'database unavailable', 'Redis unavailable']).run(async ({ assert, cleanup }, failureClass) => {
    const original = await app.container.make('bullmq')
    const isolated = new BullMQ(original.connection)
    const name = `cleanup-startup-review-${randomUUID()}`
    const queue = original.queue<{ cleanupId: string }, null>(name)
    let closeWorker: (() => Promise<void>) | undefined
    const routing = mock.method(isolated, 'worker', (_name: string, callback: Parameters<BullMQ['worker']>[1]) => {
      const worker = original.worker(name, callback, { connection: original.connection, autorun: false })
      closeWorker = () => worker.close()
      return worker
    })
    app.container.swap(BullMQ, () => isolated)
    cleanup(async () => { routing.mock.restore(); app.container.restore(BullMQ); if (closeWorker) await closeWorker(); await queue.obliterate({ force: true }); await queue.close() })
    const firstStarted = deferred()
    const firstFinish = deferred()
    let sweeps = 0
    const sweep = mock.method(Service.prototype, 'sweep', async () => {
      sweeps++
      if (sweeps === 1) { firstStarted.resolve(); await firstFinish.promise; throw new Error(`Synthetic ${failureClass}`) }
    })
    cleanup(() => sweep.mock.restore())
    let tick: (() => void) | undefined
    const originalInterval = globalThis.setInterval
    const interval = mock.method(globalThis, 'setInterval', (callback: () => void, milliseconds?: number) => {
      tick = callback
      const timer = originalInterval(callback, milliseconds)
      cleanup(() => clearInterval(timer))
      return timer
    })
    cleanup(() => interval.mock.restore())
    const command = await ace.create(CleanupListener, [])
    const running = command.run()
    await firstStarted.promise
    if (!tick) throw new Error('Expected sweep timer')
    tick(); tick()
    assert.equal(sweeps, 1)
    firstFinish.resolve()
    await running
    tick()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(sweeps, 2)
  })

  test('query debugging sees ciphertext rather than the recovered credential', async ({ assert }) => {
    const queries: { sql: string, bindings?: readonly unknown[] }[] = []
    const listener = (query: { sql: string, bindings?: readonly unknown[] }) => { queries.push(query) }
    const connection = db.connection().getWriteClient()
    connection.on('query', listener)
    try {
      const row = await protect()
      await service.attempt(row.id, true)
    } finally { connection.removeListener('query', listener) }
    assert.isNotEmpty(queries)
    assert.notInclude(JSON.stringify(queries), secret)
  })

  test('expired credentials are destroyed in PostgreSQL even when Redis enqueue fails', async ({ assert, cleanup }) => {
    const expired = await protect()
    expired.status = 'review_required'; expired.credentialExpiresAt = DateTime.utc().minus({ days: 1 }); await expired.save()
    const due = await protect()
    due.nextAttemptAt = DateTime.utc().minus({ seconds: 1 }); await due.save()
    const original = await app.container.make('bullmq')
    const isolated = new BullMQ(original.connection)
    const name = `cleanup-expiry-review-${randomUUID()}`
    const queue = original.queue<{ cleanupId: string }, null>(name)
    const enqueue = mock.method(queue, 'add', async () => { throw new Error('Synthetic Redis enqueue failure') })
    const routing = mock.method(isolated, 'queue', () => queue)
    app.container.swap(BullMQ, () => isolated)
    cleanup(() => { enqueue.mock.restore(); routing.mock.restore(); app.container.restore(BullMQ) })
    cleanup(async () => { const fresh = original.queue(name); await fresh.obliterate({ force: true }); await fresh.close() })
    await assert.rejects(() => service.sweep())
    assert.isNull((await expired.refresh()).encryptedAccessToken)
    assert.equal(expired.lastErrorClass, 'credential_expired')
    assert.isNotNull((await due.refresh()).encryptedAccessToken)
    assert.equal(due.status, 'protected')
    assert.equal(due.attemptCount, 0)
    assert.equal(calls, 0)
  })

  test('a stalled Redis enqueue is bounded so later retention sweeps can run', async ({ assert, cleanup }) => {
    const row = await protect()
    row.nextAttemptAt = DateTime.utc().minus({ seconds: 1 }); await row.save()
    const original = await app.container.make('bullmq')
    const isolated = new BullMQ(original.connection)
    const name = `cleanup-stalled-review-${randomUUID()}`
    const queue = original.queue<{ cleanupId: string }, null>(name)
    const started = deferred()
    const release = deferred()
    const enqueue = mock.method(queue, 'add', async () => { started.resolve(); await release.promise; throw new Error('Synthetic enqueue failure') })
    const routing = mock.method(isolated, 'queue', () => queue)
    app.container.swap(BullMQ, () => isolated)
    cleanup(() => { enqueue.mock.restore(); routing.mock.restore(); app.container.restore(BullMQ) })
    cleanup(async () => { const fresh = original.queue(name); await fresh.obliterate({ force: true }); await fresh.close() })
    let timeout: (() => void) | undefined
    const originalTimeout = globalThis.setTimeout
    const timer = mock.method(globalThis, 'setTimeout', (callback: () => void, milliseconds?: number) => {
      if (milliseconds === 5_000) timeout = callback
      return originalTimeout(callback, milliseconds)
    })
    cleanup(() => timer.mock.restore())
    const result = service.sweep().then(() => undefined, (error: unknown) => error)
    await started.promise
    try {
      assert.isFunction(timeout)
      if (timeout) timeout()
      assert.instanceOf(await result, Error)
      assert.equal((await row.refresh()).attemptCount, 0)
      assert.equal(calls, 0)
    } finally { release.resolve(); await result }
  })

})
