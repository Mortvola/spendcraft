import User from '#models/User'
import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import VerifyEmailNotification from '#mails/verifyEmailNotification'

test.group('Users', () => {
  const username = 'testuser'
  const email = 'shields12345@msn.com'
  const password = 'testPassw0rd'

  test('register invalid password test', async ({ client }) => {
    const password = 'invalidinvalid'
    const response = await client.post('/api/v1/register')
      .json({
        username,
        email,
        password,
        passwordConfirmation: password,
      })
      .accept('json')

    response.dumpBody()
    
    response.assertStatus(422)
  })

  test('register short password test', async ({ client }) => {
    const password = 'invalid'
    const response = await client.post('/api/v1/register')
      .json({
        username,
        email,
        password,
        passwordConfirmation: password,
      })
      .accept('json')

    response.dumpBody()
    
    response.assertStatus(422)
  })

  test('register invalid email test', async ({ client }) => {
    const response = await client.post('/api/v1/register')
      .json({
        username,
        email: 'invalid-email',
        password,
        passwordConfirmation: password,
      })
      .accept('json')

    response.dumpBody()
    
    response.assertStatus(422)
  })

  test('register', async ({ client, cleanup }) => {
    const { mails } = mail.fake()

    cleanup(() => {
      mail.restore()
    })

    const response = await client.post('/api/v1/register')
      .json({
        username,
        email,
        password,
        passwordConfirmation: password,
      })
      .accept('json')

    response.assertStatus(200)

    mails.assertSent(
      VerifyEmailNotification,
      ({ message }) => {
        return message.hasTo(email)
      }
    )
  })

  test('add group test', async ({ client, assert }) => {
    const user = await User.findBy('username', username)

    assert.isNotNull(user)

    const response = await client.post('/api/v1/groups')
      .json({
        name: 'Test Group',
      })
      .accept('json')
      .loginAs(user!)

    response.assertStatus(200)
  })

  test('get test', async ({ client, assert }) => {
    const user = await User.findBy('username', username)

    assert.isNotNull(user)

    const response = await client.get('/api/v1/groups')
      .accept('json')
      .loginAs(user!)

    response.assertStatus(200)

      // response.assertBody({
      //   data: {
      //     categories: [

      //     ],
      //     groups: [

      //     ]
      //   }
      // })
  })
})