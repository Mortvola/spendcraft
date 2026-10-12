import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Group from '#models/Group'
import User from '#models/User'
import { CategoryType } from '#common/ResponseTypes'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

let sequence = 0
function signal() {
  let release: () => void = () => { throw new Error('Signal not initialized') }
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
async function fixture(multiple = false) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `delete-order-${++sequence}`,
      email: `delete-order-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Deletion ordering', type: 'Regular' })
    const first = await group.related('categories').create({ name: 'Held category', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    const second = multiple ? await group.related('categories').create({ name: 'Sibling category', type: CategoryType.Regular, balance: 0, fundingCategories: [] }) : null
    return { budget, user, group, first, second }
  })
}
async function state(f: Awaited<ReturnType<typeof fixture>>) {
  return { user: await User.find(f.user.id), budget: await Budget.find(f.budget.id),
    group: await Group.find(f.group.id), first: await Category.find(f.first.id),
    second: f.second ? await Category.find(f.second.id) : null }
}

test.group('Last-user deletion async lifecycle', () => {
  test('normal last-user deletion records cleanup and transaction completion', async ({ client, assert, cleanup }) => {
    const f = await fixture()
    const captured: TransactionClientContract[] = []
    const original = db.transaction.bind(db)
    const capture = mock.method(db, 'transaction', async () => { const trx = await original(); captured.push(trx); return trx })
    cleanup(() => capture.mock.restore())
    const operations: Promise<void>[] = []
    const categoryDelete = Category.prototype.delete
    const observeDeletes = mock.method(Category.prototype, 'delete', function (this: Category) {
      const operation = categoryDelete.call(this)
      operations.push(operation)
      return operation
    })
    cleanup(() => observeDeletes.mock.restore())
    const response = await client.delete('/api/v1/user').accept('json').loginAs(f.user)
    assert.lengthOf(captured, 1)
    assert.isTrue(captured[0].isCompleted)
    const outcomes = await Promise.allSettled(operations)
    response.assertStatus(200)
    assert.isTrue(outcomes.every((outcome) => outcome.status === 'fulfilled'))
    assert.deepEqual(await state(f), { user: null, budget: null, group: null, first: null, second: null })
  })

  for (const scenario of ['delayed', 'delayed-failure', 'delayed-sibling']) {
    test(scenario, async ({ client, assert, cleanup }) => {
      const f = await fixture(scenario === 'delayed-sibling')
      const events: string[] = []
      const started = signal()
      const siblingStarted = signal()
      const siblingFinished = signal()
      const release = signal()
      const before = JSON.stringify(await state(f))
      const captured: TransactionClientContract[] = []
      const deletes: Promise<void>[] = []
      let bindingAtStart = false
      let bindingAtExecution = false
      let requestCompleted = false
      const transaction = db.transaction.bind(db)
      const capture = mock.method(db, 'transaction', async () => {
        const trx = await transaction()
        captured.push(trx)
        const commit = trx.commit.bind(trx)
        mock.method(trx, 'commit', async () => { events.push('commit-begins'); await commit(); events.push('commit-completes') })
        const rollback = trx.rollback.bind(trx)
        mock.method(trx, 'rollback', async () => { events.push('rollback-begins'); await rollback(); events.push('rollback-completes') })
        return trx
      })
      cleanup(() => capture.mock.restore())
      const originalDelete = Category.prototype.delete
      const categoryCapture = mock.method(Category.prototype, 'delete', function (this: Category) {
        const operation = (async () => {
          if (this.id === f.first.id) {
            bindingAtStart = this.$trx === captured[0]
            events.push('held-delete-started'); started.release()
            await release.promise
            bindingAtExecution = this.$trx === captured[0]
            if (scenario === 'delayed-failure') throw new Error('Injected delayed Category deletion failure')
          }
          if (this.id === f.second?.id) siblingStarted.release()
          await originalDelete.call(this)
          if (this.id === f.second?.id) siblingFinished.release()
          events.push(this.id === f.first.id ? 'held-delete-completed' : 'other-delete-completed')
        })()
        deletes.push(operation)
        return operation
      })
      cleanup(() => categoryCapture.mock.restore())
      const groupDelete = Group.prototype.delete
      const groupCapture = mock.method(Group.prototype, 'delete', async function (this: Group) {
        if (this.id === f.group.id) { events.push('subsequent-group-delete-begins') }
        await groupDelete.call(this)
      })
      cleanup(() => groupCapture.mock.restore())
      const request = client.delete('/api/v1/user').accept('json').loginAs(f.user).send().then((response) => {
        requestCompleted = true; events.push('request-completed'); return response
      })
      try {
        await started.promise
        if (scenario === 'delayed-sibling') {
          await siblingStarted.promise
          await siblingFinished.promise
        }
        // Let already-ready promise continuations run; no duration-based sleep.
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.isTrue(bindingAtStart)
        assert.notInclude(events, 'subsequent-group-delete-begins')
        assert.notInclude(events, 'commit-begins')
        assert.notInclude(events, 'rollback-begins')
        assert.isFalse(captured[0].isCompleted)
        assert.isFalse(requestCompleted)
        release.release()
        const response = await request
        const outcomes = await Promise.allSettled(deletes)
        if (scenario === 'delayed-failure') assert.isAtLeast(response.status(), 400)
        else response.assertStatus(200)
        assert.isTrue(bindingAtExecution)
        assert.isTrue(captured[0].isCompleted)
        if (scenario === 'delayed-failure') {
          assert.isTrue(outcomes.some((outcome) => outcome.status === 'rejected'))
          assert.include(events, 'rollback-completes')
          assert.notInclude(events, 'commit-begins')
          assert.notInclude(events, 'subsequent-group-delete-begins')
          assert.equal(JSON.stringify(await state(f)), before)
        } else {
          assert.isTrue(outcomes.every((outcome) => outcome.status === 'fulfilled'))
          assert.include(events, 'commit-completes')
          assert.isTrue(events.every((event, index) => !event.endsWith('delete-completed') || index < events.indexOf('commit-begins')))
          assert.isBelow(events.indexOf('held-delete-completed'), events.indexOf('subsequent-group-delete-begins'))
          assert.isBelow(events.indexOf('held-delete-completed'), events.indexOf('commit-begins'))
          assert.deepEqual(await state(f), { user: null, budget: null, group: null, first: null, second: null })
        }
      } finally {
        release.release()
        await Promise.allSettled(deletes)
        await request.catch(() => { /* The original request result remains observed by the test. */ })
        for (const trx of captured) if (!trx.isCompleted) await trx.rollback()
      }
    })
  }
})
