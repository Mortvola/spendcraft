import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import Budget from '#models/Budget'
import User from '#models/User'
import { UserService } from '#services/userService'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

let sequence = 0
function details() {
  return { username: `rollback-order-${++sequence}`, email: `rollback-order-${sequence}@example.com`, password: 'testPassw0rd' }
}
function signal() {
  let release: () => void = () => { throw new Error('Signal not initialized') }
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
async function persisted() {
  return Promise.all(['applications', 'users', 'groups', 'categories'].map((table) => db.from(table).orderBy('id')))
}

test.group('UserService rollback completion ordering', () => {
  test('successful creation completes its transaction through commit', async ({ assert, cleanup }) => {
    mail.fake()
    cleanup(() => mail.restore())
    const captured: TransactionClientContract[] = []
    const original = db.transaction.bind(db)
    const interception = mock.method(db, 'transaction', async () => {
      const trx = await original()
      captured.push(trx)
      return trx
    })
    cleanup(() => interception.mock.restore())
    const user = await new UserService().create(details())
    assert.lengthOf(captured, 1)
    assert.isTrue(captured[0].isCompleted)
    assert.isNotNull(await User.find(user.id))
  })

  for (const gated of [false, true]) {
    test(gated ? 'service waits for gated rollback before rejecting' : 'failure completes rollback before propagating the original error', async ({ assert, cleanup }) => {
      const before = await persisted()
      const failure = new Error('Injected failure after budget initialization')
      const initialize = Budget.prototype.initialize
      const failureInjection = mock.method(Budget.prototype, 'initialize', async function (this: Budget) {
        await initialize.call(this)
        throw failure
      })
      cleanup(() => failureInjection.mock.restore())
      const releaseRollback = signal()
      const started = signal()
      const finished = signal()
      const captured: TransactionClientContract[] = []
      let rollbackPromise: Promise<void> | undefined
      const original = db.transaction.bind(db)
      const interception = mock.method(db, 'transaction', async () => {
        const trx = await original()
        captured.push(trx)
        const rollback = trx.rollback.bind(trx)
        mock.method(trx, 'rollback', () => {
          started.release()
          rollbackPromise = (async () => {
            if (gated) await releaseRollback.promise
            await rollback()
            finished.release()
          })()
          return rollbackPromise
        })
        return trx
      })
      cleanup(() => interception.mock.restore())
      // Handle rejection immediately; no unhandled rejection or timing-based observation.
      let settled = false
      const outcome = new UserService().create(details()).then(
        () => { settled = true; return { rejected: false, error: undefined, completed: captured[0]?.isCompleted } },
        (error: unknown) => { settled = true; return { rejected: true, error, completed: captured[0]?.isCompleted } },
      )
      try {
        await started.promise
        assert.lengthOf(captured, 1)
        if (gated) {
          // Drain already-ready promise continuations without a duration-based sleep.
          await new Promise<void>((resolve) => setImmediate(resolve))
          assert.isFalse(settled)
          assert.isFalse(captured[0].isCompleted)
        }
        releaseRollback.release()
        const observed = await outcome
        assert.isTrue(observed.rejected)
        assert.strictEqual(observed.error, failure)
        assert.isTrue(observed.completed)
        await finished.promise
        assert.isTrue(captured[0].isCompleted)
        assert.deepEqual(await persisted(), before)
        assert.isArray(await db.from('applications').select('id'))
      } finally {
        // Complete the deliberately held transaction even if an assertion fails.
        releaseRollback.release()
        if (rollbackPromise) await rollbackPromise
      }
    })
  }
})
