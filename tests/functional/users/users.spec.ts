import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import VerifyEmailNotification from '#mails/verifyEmailNotification'

test.group('Users', () => {
  const username = 'testuser'
  const email = 'test@example.com'
  const password = 'testPassw0rd'

  test('register invalid password test - "{password}"')
    .with([
      {
        password: 'invalidinvalid',
        status: 422,
      },
      {
        password: 'invalid',
        status: 422,
      }
    ])
    .run(async ({ client, cleanup }, row) => {
      mail.fake()

      cleanup(() => {
        mail.restore()
      })

      const response = await client.post('/api/v1/register')
        .json({
          username,
          email,
          password: row.password,
          passwordConfirmation: row.password,
        })
        .accept('json')

      response.assertStatus(row.status)
      response.assertAgainstApiSpec()
    })

  test('register invalid email test')
    .run(async ({ client, cleanup }) => {
      mail.fake()

      cleanup(() => {
        mail.restore()
      })

      const response = await client.post('/api/v1/register')
        .json({
          username,
          email: 'invalid-email',
          password,
          passwordConfirmation: password,
        })
        .accept('json')

      response.assertStatus(422)
      response.assertAgainstApiSpec()
    })

  test('register')
    .run(async ({ client, cleanup }) => {
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
      response.assertAgainstApiSpec()

      mails.assertSent(
        VerifyEmailNotification,
        ({ message }) => {
          return message.hasTo(email)
        }
      )
    })
})