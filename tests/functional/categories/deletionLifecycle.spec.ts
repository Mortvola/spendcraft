import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Category from '#models/Category'
import { DateTime } from 'luxon'
import { CategoryType, TransactionType } from '#common/ResponseTypes'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { ApiClient } from '@japa/api-client'

let sequence = 0

test.group('Category deletion transaction lifecycle', (group) => {
  async function fixture() {
    return db.transaction(async (trx) => {
      const budget = await Budget.create({}, { client: trx })
      await budget.initialize()
      const user = await budget.related('users').create({ username: `category-lifecycle-${++sequence}`,
        email: `category-lifecycle-${sequence}@example.com`, password: 'testPassw0rd' })
      const categoryGroup = await budget.related('groups').create({ name: 'Lifecycle', type: 'Regular' })
      const blocked = await categoryGroup.related('categories').create({ name: 'Referenced', type: CategoryType.Regular, balance: 10, fundingCategories: [] })
      const empty = await categoryGroup.related('categories').create({ name: 'Empty', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
      await budget.related('transactions').create({ date: DateTime.fromISO('2025-02-10'), type: TransactionType.MANUAL_TRANSACTION,
        categories: [{ categoryId: blocked.id, amount: 10 }], taxes: [], version: 0, deleted: false, sortOrder: 0 })
      return { user, categoryGroup, blocked, empty }
    })
  }

  let f: Awaited<ReturnType<typeof fixture>>
  let captured: TransactionClientContract[]
  group.each.setup(async () => {
    f = await fixture()
    captured = []
    const transaction = db.transaction.bind(db)
    const interception = mock.method(db, 'transaction', async () => {
      const trx = await transaction()
      captured.push(trx)
      return trx
    })
    return () => interception.mock.restore()
  })

  async function remove(client: ApiClient, id: number) {
    return client.delete(`/api/v1/groups/${f.categoryGroup.id}/categories/${id}`).accept('json').loginAs(f.user)
  }

  test('successful deletion commits its transaction', async ({ client, assert }) => {
    ;(await remove(client, f.empty.id)).assertStatus(204)
    assert.lengthOf(captured, 1)
    assert.isTrue(captured[0].isCompleted)
    assert.isNull(await Category.find(f.empty.id))
  })

  test('blocked deletion completes its transaction without changing the category', async ({ client, assert }) => {
    ;(await remove(client, f.blocked.id)).assertStatus(409)
    assert.lengthOf(captured, 1)
    assert.isTrue(captured[0].isCompleted)
    assert.equal((await Category.findOrFail(f.blocked.id)).balance, 10)
  })

  test('repeated blocked deletes complete distinct transactions', async ({ client, assert }) => {
    for (let i = 0; i < 2; i++) (await remove(client, f.blocked.id)).assertStatus(409)
    assert.lengthOf(captured, 2)
    assert.notStrictEqual(captured[0], captured[1])
    assert.isTrue(captured.every((trx) => trx.isCompleted))
  })

  test('a database query succeeds after rejected deletion completes', async ({ client, assert }) => {
    ;(await remove(client, f.blocked.id)).assertStatus(409)
    assert.equal((await Category.findOrFail(f.empty.id)).name, 'Empty')
    assert.isTrue(captured[0].isCompleted)
  })

  test('normal deletion after repeated rejection leaves all transactions completed', async ({ client, assert }) => {
    for (let i = 0; i < 2; i++) (await remove(client, f.blocked.id)).assertStatus(409)
    ;(await remove(client, f.empty.id)).assertStatus(204)
    assert.lengthOf(captured, 3)
    assert.isTrue(captured[0].isCompleted)
    assert.isTrue(captured[1].isCompleted)
    assert.isTrue(captured[2].isCompleted)
  })

  test('a failure after category deletion rolls back and restores the category', async ({ client, assert, cleanup }) => {
    const original = Category.prototype.delete
    const interception = mock.method(Category.prototype, 'delete', async function (this: Category) {
      await original.call(this)
      throw new Error('Injected post-delete lifecycle failure')
    })
    cleanup(() => interception.mock.restore())
    ;(await remove(client, f.empty.id)).assertStatus(500)
    assert.lengthOf(captured, 1)
    assert.isTrue(captured[0].isCompleted)
    assert.isNotNull(await Category.find(f.empty.id))
  })
})
