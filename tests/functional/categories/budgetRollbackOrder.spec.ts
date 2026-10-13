import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import Budget from '#models/Budget'
import Category from '#models/Category'
import { CategoryType } from '#common/ResponseTypes'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

function signal() {
  let release: () => void = () => { throw new Error('Signal not initialized') }
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
async function fixture() {
  const budget = await Budget.create({})
  const group = await budget.related('groups').create({ name: 'Rollback ordering', type: 'Regular' })
  const category = await group.related('categories').create({ name: 'Original', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
  return { budget, category }
}

test.group('Budget synchronization rollback completion ordering', () => {
  test('normal synchronization commits before resolving undefined', async ({ assert, cleanup }) => {
    const f = await fixture()
    const before = (await Category.findOrFail(f.category.id)).serialize()
    const captured: TransactionClientContract[] = []
    const original = db.transaction.bind(db)
    const capture = mock.method(db, 'transaction', async () => { const trx = await original(); captured.push(trx); return trx })
    cleanup(() => capture.mock.restore())
    let calls = 0
    const sync = Category.prototype.syncBalance
    const observe = mock.method(Category.prototype, 'syncBalance', async function (this: Category) {
      assert.strictEqual(this.$trx, captured[0]); calls++; await sync.call(this)
    })
    cleanup(() => observe.mock.restore())
    assert.isUndefined(await f.budget.syncCategoryBalances())
    assert.equal(calls, 1)
    assert.lengthOf(captured, 1)
    assert.isTrue(captured[0].isCompleted)
    assert.deepEqual((await Category.findOrFail(f.category.id)).serialize(), before)
  })

  for (const subsequentQuery of [false, true]) {
    test(subsequentQuery ? 'awaiting caller queries only after rollback completes' : 'failure is logged and method waits for rollback before resolving', async ({ assert, cleanup }) => {
      const f = await fixture()
      const before = (await Category.findOrFail(f.category.id)).serialize()
      const failure = new Error('Injected dormant synchronization failure')
      const logged: unknown[] = []
      const log = mock.method(logger, 'error', (...values: unknown[]) => { logged.push(...values) })
      cleanup(() => log.mock.restore())
      const captured: TransactionClientContract[] = []
      const started = signal()
      const release = signal()
      let rollbackPromise: Promise<void> | undefined
      const events: string[] = []
      const original = db.transaction.bind(db)
      const capture = mock.method(db, 'transaction', async () => {
        const trx = await original(); captured.push(trx)
        const rollback = trx.rollback.bind(trx)
        mock.method(trx, 'rollback', () => {
          started.release()
          rollbackPromise = (async () => { await release.promise; await rollback(); events.push('rollback-completed') })()
          return rollbackPromise
        })
        return trx
      })
      cleanup(() => capture.mock.restore())
      const injection = mock.method(Category.prototype, 'syncBalance', async function (this: Category) {
        assert.strictEqual(this.$trx, captured[0])
        // A test-only write demonstrates rollback of the transaction-bound execution.
        await this.merge({ name: 'Temporary characterization write' }).save()
        throw failure
      })
      cleanup(() => injection.mock.restore())
      let settled = false
      let callerStarted = false
      const outcome = f.budget.syncCategoryBalances().then(async (value) => {
        settled = true
        events.push('method-resolved')
        if (subsequentQuery) {
          callerStarted = true
          events.push('caller-query-started')
          assert.isNotNull(await Budget.find(f.budget.id))
        }
        return value
      })
      try {
        await started.promise
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.isFalse(settled)
        assert.isFalse(callerStarted)
        assert.include(logged, failure)
        assert.isFalse(captured[0].isCompleted)
        release.release()
        assert.isUndefined(await outcome)
        assert.isTrue(captured[0].isCompleted)
        assert.deepEqual(events, subsequentQuery
          ? ['rollback-completed', 'method-resolved', 'caller-query-started']
          : ['rollback-completed', 'method-resolved'])
        assert.deepEqual((await Category.findOrFail(f.category.id)).serialize(), before)
      } finally {
        release.release()
        if (rollbackPromise) await rollbackPromise
      }
    })
  }
})
