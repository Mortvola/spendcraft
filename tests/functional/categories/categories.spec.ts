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

  test('add group')
    .run(async ({ client, assert }) => {
      // const user = await useGetTestUser()
      assert.isNotNull(user)

      const response = await client.post('/api/v1/groups')
        .json({
          name: testGroupName,
        })
        .accept('json')
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()
    })

  test('add duplicate group')
    .run(async ({ client, assert }) => {
      // const user = await useGetTestUser()
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

  test('get category tree')
    .run(async ({ client, assert }) => {
      // const user = await useGetTestUser()
      assert.isNotNull(user)

      const response = await client.get('/api/v1/groups')
        .accept('json')
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()
    })
})
