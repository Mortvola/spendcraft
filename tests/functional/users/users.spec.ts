import Budget from '#models/Budget'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import VerifyEmailNotification from '#mails/verifyEmailNotification'

test.group('Users', () => {
  const username = 'testuser'
  const email = 'test@example.com'
  const password = 'testPassw0rd'

  test('profile PATCH and pending-email deletion return the User wrapper', async ({ client,
    assert, cleanup }) => {
    mail.fake()
    cleanup(() => mail.restore())
    const budget = await Budget.create({})
    const user = await budget.related('users').create({ username: 'profile-wrapper',
      email: 'profile-wrapper@example.com', password })
    const other = await budget.related('users').create({ username: 'other-profile',
      email: 'other-profile@example.com', password })
    const before = await db.from('users').where('id', other.id).firstOrFail()
    const patched = await client.patch('/api/v1/user').json({ email: 'pending@example.com' })
      .accept('json').loginAs(user)
    patched.assertStatus(200)
    assert.deepEqual(Object.keys(patched.body()), ['data'])
    assert.equal(patched.body().data.username, user.username)
    assert.equal(patched.body().data.email, user.email)
    assert.equal(patched.body().data.pendingEmail, 'pending@example.com')
    assert.notProperty(patched.body().data, 'password')
    await user.refresh()
    assert.equal(user.pendingEmail, 'pending@example.com')
    const removed = await client.delete('/api/v1/user/pending-email').accept('json').loginAs(user)
    removed.assertStatus(200)
    assert.deepEqual(Object.keys(removed.body()), ['data'])
    assert.equal(removed.body().data.email, user.email)
    assert.isNull(removed.body().data.pendingEmail)
    await user.refresh()
    assert.isNull(user.pendingEmail)
    assert.deepEqual(await db.from('users').where('id', other.id).firstOrFail(), before)
  })

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