import { test } from '@japa/runner'
import User from '#models/User'
import app from '@adonisjs/core/services/app'
import { UserService } from '#services/userService'
import mail from '@adonisjs/mail/services/main'

test.group('Categories', (group) => {
  let user: User | null = null;
  const testGroupName = 'Test Group'

  group.setup(async () => {
    const username = 'testuser2'
    const email = 'test2@example.com'
    const password = 'testPassw0rd'

    user = await User.findBy('username', username)

    // If the user does not exist then create it.
    if (!user) {
      mail.fake()
      const userService = await app.container.make(UserService)
      user = await userService.create({ username, email, password })
      mail.restore()
    }
  })

  let groupId: number | null = null
  let categoryId: number | null = null

  test('add group')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)

      const response = await client.post('/api/v1/groups')
        .json({
          name: testGroupName,
        })
        .accept('json')
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()

      groupId = response.body().data.id
    })

  test('add duplicate group')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)

      const response = await client.post('/api/v1/groups')
        .json({
          name: testGroupName,
        })
        .accept('json')
        .loginAs(user!)

      response.assertStatus(422)
      response.assertAgainstApiSpec()
    })

  test('update group')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)
      assert.isNotNull(groupId)

      const response = await client.patch(`/api/v1/groups/${groupId}`)
        .json({
          name: `${testGroupName} updated`,
        })
        .accept('json')
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()
    })

  test('add category')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)
      assert.isNotNull(groupId)

      const response = await client.post(`/api/v1/groups/${groupId}/categories`)
        .json({
          name: 'Test Category',
          useGoal: false,
          fundingCategories: [],
        })
        .accept('json')
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()

      categoryId = response.body().data.id
    })

  test('delete group failure')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)
      assert.isNotNull(groupId)

      // This request should fail since the group contains a category
      const response = await client.delete(`/api/v1/groups/${groupId}`)
        .accept('json')
        .loginAs(user!)

      response.assertStatus(409)
      response.assertAgainstApiSpec()
    })

  test('update category')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)
      assert.isNotNull(categoryId)

      const response = await client.patch(`/api/v1/groups/${groupId}/categories/${categoryId}`)
        .json({
          name: 'Test Category Updated'
        })
        .accept('json')
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()
    })

  test('delete category')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)
      assert.isNotNull(groupId)
      assert.isNotNull(categoryId)

      const response = await client.delete(`/api/v1/groups/${groupId}/categories/${categoryId}`)
        .accept('json')
        .loginAs(user!)

      response.assertStatus(204)
      response.assertAgainstApiSpec()

      categoryId = null;
    })

  test('delete group')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)
      assert.isNotNull(groupId)

      const response = await client.delete(`/api/v1/groups/${groupId}`)
        .accept('json')
        .loginAs(user!)

      response.assertStatus(204)
      response.assertAgainstApiSpec()
    })

  test('get category tree')
    .run(async ({ client, assert }) => {
      assert.isNotNull(user)

      const response = await client.get('/api/v1/groups')
        .accept('json')
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()
    })
})
