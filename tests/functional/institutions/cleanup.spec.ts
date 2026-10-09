import { test } from '@japa/runner'
import { mock } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import Cleanup from '#models/PlaidItemCleanup'
import Budget from '#models/Budget'
import Institution from '#models/Institution'
import PlaidWrapper from '#providers/Plaid/Plaid'
import PlaidException from '#providers/Plaid/PlaidException'
import Service from '#services/plaidItemCleanup'
import { BullMQ } from '#providers/BullMQ'
import { QueueNamesEnum } from '#contracts/QueueInterfaces'

const token = 'SYNTHETIC_CLEANUP_SECRET_NEVER_DISPLAY'

test.group('Durable Plaid Item cleanup', (group) => {
  let service: Service
  let calls: number
  let failure: unknown
  let wrapper: PlaidWrapper
  group.each.setup(async () => {
    await Cleanup.query().delete()
    service = new Service()
    calls = 0
    failure = undefined
    const original = { ...app.config.get<{ activeKey: string, keys: string }>('plaidCleanup') }
    app.config.set('plaidCleanup', { activeKey: 'v1', keys: JSON.stringify({ v1: randomBytes(32).toString('base64') }) })
    wrapper = new PlaidWrapper(app.config.get('plaid'))
    app.container.swap(PlaidWrapper, () => wrapper)
    const removal = mock.method(wrapper, 'removeItem', async () => {
      calls++
      if (failure) throw failure
      return { request_id: 'synthetic-remove' }
    })
    return () => { app.config.set('plaidCleanup', original); removal.mock.restore(); app.container.restore(PlaidWrapper) }
  })
  const protect = () => service.protect(randomUUID(), token)
  const due = async (row: Cleanup) => { row.nextAttemptAt = DateTime.utc().minus({ seconds: 1 }); await row.save() }

  test('durable protection is encrypted, purpose-bound, versioned and excluded from serialization', async ({ assert }) => {
    await service.ready()
    const row = await protect()
    assert.equal(row.status, 'protected')
    assert.equal(row.keyVersion, 'v1')
    assert.notInclude(row.encryptedAccessToken ?? '', token)
    assert.notProperty(row.serialize(), 'encryptedAccessToken')
    await service.attempt(row.id, true)
    assert.equal(calls, 1)
    await row.refresh()
    assert.equal(row.status, 'completed')
    assert.isNull(row.encryptedAccessToken)
  })

  test('setup cancellation and Institution commit are atomic', async ({ assert }) => {
    const row = await protect()
    const budget = await Budget.create({})
    await db.transaction(async (trx) => {
      const locked = await service.lockSetup(row.id, trx)
      await Institution.create({ budgetId: budget.id, plaidItemId: row.itemId, name: 'Committed', accessToken: token }, { client: trx })
      await service.cancelSetup(locked)
    })
    await service.attempt(row.id, true)
    await row.refresh()
    assert.equal(calls, 0)
    assert.equal(row.status, 'cancelled')
    assert.isNull(row.encryptedAccessToken)
  })

  test('failed setup rolls back cancellation and preserves decryptable recovery', async ({ assert }) => {
    const row = await protect()
    const trx = await db.transaction()
    await service.cancelSetup(await service.lockSetup(row.id, trx))
    await trx.rollback()
    failure = new Error('Synthetic lost response')
    await service.attempt(row.id, true)
    await row.refresh()
    assert.equal(row.status, 'pending')
    assert.equal(row.attemptCount, 1)
    assert.isNotNull(row.encryptedAccessToken)
    failure = undefined
    await due(row)
    await service.attempt(row.id)
    assert.equal(calls, 2)
    await row.refresh()
    assert.isNull(row.encryptedAccessToken)
  })

  test('committed Institution safety check overrides stale recovery responsibility', async ({ assert }) => {
    const row = await protect()
    const budget = await Budget.create({})
    await Institution.create({ budgetId: budget.id, plaidItemId: row.itemId, name: 'Committed', accessToken: token })
    await service.attempt(row.id, true)
    await row.refresh()
    assert.equal(calls, 0)
    assert.equal(row.status, 'cancelled')
  })

  test('cleanup racing successful setup never removes its Item', async ({ assert }) => {
    const row = await protect()
    const budget = await Budget.create({})
    const trx = await db.transaction()
    const locked = await service.lockSetup(row.id, trx)
    const pending = service.attempt(row.id, true)
    try {
      let blocked = false
      for (let i = 0; i < 100 && !blocked; i++) {
        const waiting = await db.rawQuery("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%plaid_item_cleanups%'")
        blocked = waiting.rows[0].count > 0
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 5))
      }
      assert.isTrue(blocked, 'Cleanup must actually be blocked on the active setup row lock')
      await Institution.create({ budgetId: budget.id, plaidItemId: row.itemId, name: 'Concurrent', accessToken: token }, { client: trx })
      await service.cancelSetup(locked)
      await trx.commit()
    } finally {
      if (!trx.isCompleted) await trx.rollback()
      await pending
    }
    assert.equal(calls, 0)
    assert.equal((await row.refresh()).status, 'cancelled')
  })

  test('duplicate concurrent cleanup attempts call provider once', async ({ assert }) => {
    const row = await protect()
    await due(row)
    await Promise.all([service.attempt(row.id), service.attempt(row.id), service.attempt(row.id)])
    assert.equal(calls, 1)
  })

  test('protected grace period prevents premature removal', async ({ assert }) => {
    const row = await protect()
    await service.attempt(row.id)
    assert.equal(calls, 0)
    await due(row)
    await service.attempt(row.id)
    assert.equal(calls, 1)
  })

  test('late setup cannot attach an Item claimed for removal', async ({ assert }) => {
    const row = await protect()
    failure = new Error('Synthetic transport')
    await service.attempt(row.id, true)
    const trx = await db.transaction()
    try { await assert.rejects(() => service.lockSetup(row.id, trx), 'Plaid setup recovery state unavailable') }
    finally { await trx.rollback() }
  })

  test('transport and ambiguous lost response retain responsibility').with(['transport', 'lost response']).run(async ({ assert }) => {
    const row = await protect()
    failure = new Error('Synthetic ambiguous result')
    await service.attempt(row.id, true)
    await row.refresh()
    assert.equal(row.status, 'pending')
    assert.equal(row.lastErrorClass, 'transport_unknown')
    assert.isNotNull(row.encryptedAccessToken)
    assert.isAbove(row.nextAttemptAt?.toMillis() ?? 0, Date.now())
  })

  test('structured provider classifications are conservative').with([
    ['API_ERROR', 'INTERNAL_SERVER_ERROR', 'pending'],
    ['INVALID_INPUT', 'INVALID_ACCESS_TOKEN', 'review_required'],
    ['ITEM_ERROR', 'ITEM_NOT_FOUND', 'review_required'],
    ['API_ERROR', 'UNRECOGNIZED_SYNTHETIC', 'review_required'],
  ]).run(async ({ assert }, [type, code, expected]) => {
    const row = await protect()
    failure = new PlaidException({ response: { status: 500, data: { error_type: type, error_code: code, error_message: token } } })
    await service.attempt(row.id, true)
    await row.refresh()
    assert.equal(row.status, expected)
    assert.notInclude(JSON.stringify(row.serialize()), token)
    assert.isNotNull(row.encryptedAccessToken)
  })

  test('automatic attempts are bounded and exhaustion retains credential for thirty days', async ({ assert }) => {
    const row = await protect()
    failure = new Error('Synthetic outage')
    for (let i = 0; i < 7; i++) { await due(row); await service.attempt(row.id); await row.refresh() }
    assert.equal(calls, 7)
    assert.equal(row.status, 'review_required')
    assert.equal(row.attemptCount, 7)
    assert.isAbove(row.credentialExpiresAt?.toMillis() ?? 0, Date.now() + 29 * 86400000)
    await service.attempt(row.id, true)
    assert.equal(calls, 7)
  })

  test('expired recovery credentials are destroyed without provider calls', async ({ assert }) => {
    const row = await protect()
    row.status = 'review_required'
    row.credentialExpiresAt = DateTime.utc().minus({ days: 1 })
    await row.save()
    await service.attempt(row.id)
    await row.refresh()
    assert.isNull(row.encryptedAccessToken)
    assert.equal(row.lastErrorClass, 'credential_expired')
    assert.equal(calls, 0)
  })

  test('administrative retention extension is explicit and retry is bounded anew', async ({ assert }) => {
    const row = await protect()
    row.status = 'review_required'; row.credentialExpiresAt = DateTime.utc().plus({ days: 1 }); await row.save()
    await service.administer(row.id, 'extend', 40)
    await row.refresh()
    assert.isAbove(row.credentialExpiresAt?.toMillis() ?? 0, Date.now() + 39 * 86400000)
    await service.administer(row.id, 'retry')
    await service.attempt(row.id)
    assert.equal(calls, 1)
  })

  test('missing encryption key prevents exchange readiness', async ({ assert }) => {
    app.config.set('plaidCleanup.keys', '{}')
    await assert.rejects(() => service.ready(), 'Plaid cleanup encryption unavailable')
  })

  test('tampered ciphertext and missing old key escalate safely').with(['tampered', 'missing key']).run(async ({ assert }, scenario) => {
    const row = await protect()
    if (scenario === 'tampered') { row.encryptedAccessToken = 'invalid'; await row.save() }
    else app.config.set('plaidCleanup.keys', '{}')
    await service.attempt(row.id, true)
    assert.equal(calls, 0)
    assert.equal((await row.refresh()).lastErrorClass, 'decryption_failed')
  })

  test('rotation retains old version decryptability', async ({ assert }) => {
    const row = await protect()
    const keys = JSON.parse(app.config.get<string>('plaidCleanup.keys'))
    keys.v2 = randomBytes(32).toString('base64')
    app.config.set('plaidCleanup', { activeKey: 'v2', keys: JSON.stringify(keys) })
    const second = await protect()
    assert.equal(second.keyVersion, 'v2')
    await service.attempt(row.id, true)
    assert.equal(calls, 1)
  })

  test('provider context mismatch escalates rather than removing', async ({ assert }) => {
    const row = await protect()
    row.providerContext = 'different-context'; await row.save()
    await service.attempt(row.id, true)
    assert.equal(calls, 0)
    assert.equal((await row.refresh()).lastErrorClass, 'context_mismatch')
  })

  test('restart sweep recovers due state, retries Redis enqueue failure, and queues IDs only', async ({ assert, cleanup }) => {
    const row = await protect()
    await due(row)
    const original = await app.container.make('bullmq')
    const isolated = new BullMQ(original.connection)
    const name = `cleanup-test-${randomUUID()}`
    const queue = isolated.queue<{ cleanupId: string }, null>(name)
    const queueMethod = mock.method(isolated, 'queue', () => queue)
    app.container.swap(BullMQ, () => isolated)
    cleanup(() => { queueMethod.mock.restore(); app.container.restore(BullMQ) })
    const fail = mock.method(queue, 'add', async () => { throw new Error('Synthetic Redis unavailable') })
    await assert.rejects(() => new Service().sweep())
    fail.mock.restore()
    // sweep closes its own handle; open a fresh isolated handle after failure.
    const replacement = original.queue<{ cleanupId: string }, null>(name)
    queueMethod.mock.restore()
    const replacementMethod = mock.method(isolated, 'queue', () => replacement)
    cleanup(() => { replacementMethod.mock.restore() })
    await new Service().sweep()
    const inspect = original.queue<{ cleanupId: string }, null>(name)
    cleanup(async () => { await inspect.obliterate({ force: true }); await inspect.close() })
    const jobs = await inspect.getWaiting()
    assert.lengthOf(jobs, 1)
    assert.deepEqual(jobs[0].data, { cleanupId: row.id })
    assert.notInclude(JSON.stringify(jobs[0].data), token)
    await new Service().attempt(jobs[0].data.cleanupId)
    assert.equal(calls, 1)
    assert.equal(QueueNamesEnum.PlaidItemCleanup, 'PlaidItemCleanup')
  })
  test('attempt accounting survives a crash before recording successful removal', async ({ assert, cleanup }) => {
    const row = await protect()
    const originalSave = Cleanup.prototype.save
    const interruption = mock.method(Cleanup.prototype, 'save', function (this: Cleanup) {
      if (this.status === 'completed') throw new Error('Synthetic process interruption after remote success')
      return originalSave.call(this)
    })
    cleanup(() => interruption.mock.restore())
    await assert.rejects(() => service.attempt(row.id, true))
    interruption.mock.restore()
    await row.refresh()
    assert.equal(row.attemptCount, 1)
    assert.equal(row.status, 'pending')
    assert.isNotNull(row.encryptedAccessToken)
    await due(row)
    await new Service().attempt(row.id)
    assert.equal(calls, 2)
    assert.equal((await row.refresh()).status, 'completed')
  })

  test('provider call sees already committed attempt ledger', async ({ assert, cleanup }) => {
    const row = await protect()
    const removal = mock.method(wrapper, 'removeItem', async () => {
      const durable = await Cleanup.findOrFail(row.id)
      assert.equal(durable.attemptCount, 1)
      assert.equal(durable.status, 'pending')
      assert.isNotNull(durable.nextAttemptAt)
      return { request_id: 'synthetic-ledger-check' }
    })
    cleanup(() => removal.mock.restore())
    await service.attempt(row.id, true)
    assert.equal((await row.refresh()).status, 'completed')
  })

  test('unprotected fallback cannot remove a committed Item', async ({ assert }) => {
    const budget = await Budget.create({})
    const itemId = randomUUID()
    await Institution.create({ budgetId: budget.id, plaidItemId: itemId, name: 'Committed fallback', accessToken: token })
    await service.compensateUnprotected(itemId, token)
    assert.equal(calls, 0)
  })

  test('duplicate protection fallback respects successful setup cancellation', async ({ assert }) => {
    const row = await protect()
    await db.transaction(async (trx) => service.cancelSetup(await service.lockSetup(row.id, trx)))
    await assert.rejects(() => service.protect(row.itemId, token))
    await service.compensateUnprotected(row.itemId, token)
    assert.equal(calls, 0)
  })

  test('missing provider configuration enters bounded administrative retention', async ({ assert, cleanup }) => {
    const row = await protect()
    const original = app.config.get<string>('plaid.clientId')
    app.config.set('plaid.clientId', '')
    cleanup(() => app.config.set('plaid.clientId', original))
    await service.attempt(row.id, true)
    await row.refresh()
    assert.equal(calls, 0)
    assert.equal(row.status, 'review_required')
    assert.equal(row.lastErrorClass, 'context_unavailable')
    assert.isNotNull(row.credentialExpiresAt)
  })

})
