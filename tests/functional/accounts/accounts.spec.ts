import Account from '#models/Account'
import Statement from '#models/Statement'
import { AccountType, TrackingType } from '#common/ResponseTypes';
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
                type: AccountType.Investment,
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

  test('add Statement balance')
    .run(async ({ client, assert }) => {
      assert.isNotNull(accountId)

      const response = await client.post(`/api/v1/account/${accountId}/statements`)
        .json({
          startDate: '2025-02-01',
          endDate: '2025-02-28',
          startingBalance: 0,
          endingBalance: 150.10,
        })
        .accept('json')
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .loginAs(user!)

      response.assertStatus(200)
      const statement = await Statement.findOrFail(response.body().id)
      assert.equal(statement.endingBalance, 150.10)
      assert.equal((await Account.findOrFail(statement.accountId)).balance, 150.10)
    })

  test('add offline account')
    .run(async ({ client, assert }) => {
      assert.isNotNull(institutionId)

      const response = await client.post(`/api/v1/institution/${institutionId}/accounts`)
        .json({
          name: 'Test Account 2',
          balance: 0,
          type: AccountType.Investment,
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

