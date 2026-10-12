import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import User from '#models/User'
import Handler from '#exceptions/Handler'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

let sequence = 0
function gate() {
  let release: () => void = () => { throw new Error('Gate not initialized') }
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
async function fixture(shared = false) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const createUser = () => budget.related('users').create({ username: `delete-error-${++sequence}`,
      email: `delete-error-${sequence}@example.com`, password: 'testPassw0rd' })
    const user = await createUser()
    const other = shared ? await createUser() : null
    return { budget, user, other }
  })
}
async function snapshot(id: number) {
  return Promise.all([
    db.from('applications').where('id', id), db.from('users').where('application_id', id).orderBy('id'),
    db.from('groups').where('application_id', id).orderBy('id'),
    db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
      .where('groups.application_id', id).orderBy('categories.id'),
  ])
}

test.group('UsersController deletion error propagation', () => {
  for (const shared of [false, true]) {
    test(shared ? 'deleting one shared-budget user preserves the budget' : 'successful last-user deletion commits and removes the budget', async ({ client, assert, cleanup }) => {
      const f = await fixture(shared)
      const captured: TransactionClientContract[] = []
      const transaction = db.transaction.bind(db)
      const capture = mock.method(db, 'transaction', async () => {
        const trx = await transaction(); captured.push(trx); return trx
      })
      cleanup(() => capture.mock.restore())
      const response = await client.delete('/api/v1/user').accept('json').loginAs(f.user)
      response.assertStatus(200)
      assert.equal(response.text(), '')
      assert.lengthOf(captured, 1)
      assert.isTrue(captured[0].isCompleted)
      assert.isNull(await User.find(f.user.id))
      if (shared && f.other) {
        assert.isNotNull(await User.find(f.other.id))
        assert.isNotNull(await Budget.find(f.budget.id))
      } else assert.deepEqual(await snapshot(f.budget.id), [[], [], [], []])
    })
  }

  test('unexpected Budget deletion failure reaches exception handling after rollback', async ({ client, assert, cleanup }) => {
    const f = await fixture()
    const before = await snapshot(f.budget.id)
    const failure = new Error('Injected failure after Budget deletion')
    const originalDelete = Budget.prototype.delete
    const injection = mock.method(Budget.prototype, 'delete', async function (this: Budget) {
      await originalDelete.call(this)
      throw failure
    })
    cleanup(() => injection.mock.restore())
    const logged: unknown[] = []
    const log = mock.method(console, 'log', (...values: unknown[]) => { logged.push(...values) })
    cleanup(() => log.mock.restore())
    const handled: unknown[] = []
    let completedAtHandling: boolean | undefined
    const handle = Handler.prototype.handle
    const observeHandler = mock.method(Handler.prototype, 'handle', async function (this: Handler, ...args: Parameters<typeof handle>) {
      handled.push(args[0])
      if (args[0] === failure) completedAtHandling = captured[0]?.isCompleted
      return handle.apply(this, args)
    })
    cleanup(() => observeHandler.mock.restore())
    const started = gate()
    const release = gate()
    const captured: TransactionClientContract[] = []
    let rollbackPromise: Promise<void> | undefined
    let commits = 0
    const transaction = db.transaction.bind(db)
    const capture = mock.method(db, 'transaction', async () => {
      const trx = await transaction(); captured.push(trx)
      const commit = trx.commit.bind(trx)
      mock.method(trx, 'commit', async () => { commits++; await commit() })
      const rollback = trx.rollback.bind(trx)
      mock.method(trx, 'rollback', () => {
        started.release()
        rollbackPromise = (async () => { await release.promise; await rollback() })()
        return rollbackPromise
      })
      return trx
    })
    cleanup(() => capture.mock.restore())
    let requestCompleted = false
    const request = client.delete('/api/v1/user').accept('json').loginAs(f.user).send().then((response) => {
      requestCompleted = true; return response
    })
    try {
      await started.promise
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.include(logged, failure)
      assert.isFalse(requestCompleted)
      assert.notInclude(handled, failure)
      assert.isFalse(captured[0].isCompleted)
      release.release()
      const response = await request
      assert.isAtLeast(response.status(), 400)
      assert.isTrue(captured[0].isCompleted)
      assert.equal(commits, 0)
      assert.include(handled, failure)
      assert.isTrue(completedAtHandling)
      assert.strictEqual(handled.find((error) => error === failure), failure)
      assert.deepEqual(await snapshot(f.budget.id), before)
    } finally {
      release.release()
      if (rollbackPromise) await rollbackPromise
      await request.catch(() => { /* The request result is independently asserted above. */ })
    }
  })
})
