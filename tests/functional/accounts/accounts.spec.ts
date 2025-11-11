import { TrackingType } from '#common/ResponseTypes';
import User from '#models/User';
import { UserService } from '#services/userService';
import app from '@adonisjs/core/services/app';
import mail from '@adonisjs/mail/services/main';
import { test } from '@japa/runner'

test.group('Accounts', (group) => {
  let user: User | null = null;

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

  let institutionId: number | null = null
  let accountId: number | null = null

  test('add offline institution & account')
    .run(async ({ client }) => {
        const response = await client.post('/api/v1/institution')
          .json({
            institution: {
              name: 'Test Institution',
            },
            accounts: [
              {
                name: 'Test Account',
                balance: 0,
                type: 'investment',
                subtype: 'IRA',
                tracking: TrackingType.Balances
              }
            ],
            startDate: '2025-01-01',
          })
          .accept('json')
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          .loginAs(user!)

        response.assertStatus(200)
        response.assertAgainstApiSpec()

        institutionId = response.body().data.id
        accountId = response.body().data.accounts[0].id
    })

  test('add balance item')
    .run(async ({ client, assert }) => {
      assert.isNotNull(accountId)

      const response = await client.post(`/api/v1/account/${accountId}/balances`)
        .json({
          date: '2025-02-01',
          amount: 150.10,
        })
        .accept('json')
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .loginAs(user!)

      console.log(JSON.stringify(response.body()))
      response.assertStatus(200)
      response.assertAgainstApiSpec()
    })

  test('add offline account')
    .run(async ({ client, assert }) => {
      assert.isNotNull(institutionId)

      const response = await client.post(`/api/v1/institution/${institutionId}/accounts`)
        .json({
          name: 'Test Account 2',
          balance: 0,
          type: 'investment',
          subtype: 'IRA',
          tracking: TrackingType.Balances,
          startDate: '2025-01-01',
        })
        .accept('json')
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .loginAs(user!)

      response.assertStatus(200)
      response.assertAgainstApiSpec()
    })
})

