import { test } from '@japa/runner'
import vine from '@vinejs/vine'
import { mailboxAddress, mailboxRule } from '../../../app/validation/mailboxAddress.js'
import mail from '@adonisjs/mail/services/main'
import User from '#models/User'
import Institution from '#models/Institution'
import VerifyEmailNotification from '#mails/verifyEmailNotification'
import RequestCodeNotification from '#mails/requestCodeNotification'
import ItemLoginRequiredNotification from '#mails/itemLoginRequiredNotification'
import TestNotification from '#mails/testNotification'
import { DateTime } from 'luxon'

const accepted = [
  'user@example.com', 'User+Tag@sub.example.com',
  "a!#$%&'*+-/=?^_`{|}~@example.com",
  'élise@bücher.de', '用户@例子.公司', 'user@xn--bcher-kva.de',
  'First.Last+Tag@GoogleMail.com',
  `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`,
]
const rejected = [
  '', ' ', 'invalid', 'a@localhost', 'a..b@example.com',
  'Name <user@example.com>', '<user@example.com>',
  'a@example.com,b@example.com', 'a@example.com;b@example.com',
  'group:a@example.com;', 'user(comment)@example.com',
  '"user"@example.com', '"a b"@example.com', '"a,b"@example.com',
  '"a(b)"@example.com', 'a\\b@example.com',
  '"user"@example.com(x)evil.com',
  'user+tag(comment)@gmail.com', 'user+tag\r@gmail.com',
  `a${'(x)'.repeat(1000)}@example.com`, '>[x][x]'.repeat(1000),
  `${'a'.repeat(65)}@example.com`, `${'a'.repeat(255)}@example.com`,
  ...['\r', '\n', '\t', '\0', '\u007f', '\u0085', '\u009f'].flatMap((control) => [
    `${control}user@example.com`, `user@example.com${control}`, `us${control}er@example.com`,
  ]),
]

test.group('Mailbox policy', () => {
  test('preserves supported mailboxes').with(accepted).run(({ assert }, value) => {
    assert.equal(mailboxAddress(value), value)
  })

  test('trims spaces without changing recipient identity', ({ assert }) => {
    assert.equal(mailboxAddress('  First.Last+Tag@GoogleMail.com  '), 'First.Last+Tag@GoogleMail.com')
  })

  test('rejects unsafe mailboxes without exposing input').with(rejected).run(({ assert }, value) => {
    assert.throws(() => mailboxAddress(value), 'A valid single mailbox address is required')
  })

  const entry = vine.compile(vine.object({
    email: vine.string().use(mailboxRule()).trim().normalizeEmail({ all_lowercase: true }).email(),
  }))

  test('retains entry normalization').with([
    [' User+Tag@example.com ', 'user+tag@example.com'],
    [' First.Last+Tag@GoogleMail.com ', 'firstlast@gmail.com'],
    ['First.Last+tag@outlook.com', 'first.last@outlook.com'],
    ['foo-bar@yahoo.com', 'foo@yahoo.com'],
    ['用户@例子.公司', '用户@例子.公司'],
  ]).run(async ({ assert }, [input, expected]) => {
    assert.equal((await entry.validate({ email: input })).email, expected)
  })

  test('rejects raw unsafe input before entry normalization').with(rejected).run(async ({ assert }, email) => {
    await assert.rejects(() => entry.validate({ email }))
  })
})

test.group('Mail recipient boundary', () => {
  const factories = [
    { name: 'verification', notificationClass: VerifyEmailNotification, create: (user: User) => new VerifyEmailNotification(user) },
    { name: 'code', notificationClass: RequestCodeNotification, create: (user: User) => new RequestCodeNotification(user) },
    { name: 'institution', notificationClass: ItemLoginRequiredNotification, create: (user: User) => new ItemLoginRequiredNotification(user, new Institution().merge({ name: 'Test institution' })) },
    { name: 'command notification', notificationClass: TestNotification, create: (user: User) => new TestNotification(user.email) },
  ]

  function userWithEmail(email: string) {
    return new User().merge({ email, oneTimePassCode: { code: 'TEST', expires: DateTime.now() } })
  }

  test('delivers an ordinary recipient to the fake').with(factories).run(async ({ assert, cleanup }, factory) => {
    const { mails } = mail.fake()
    cleanup(() => mail.restore())
    const notification = factory.create(userWithEmail(' User+Tag@example.com '))
    await mail.send(notification)
    assert.isTrue(notification.message.hasTo('User+Tag@example.com'))
    mails.assertSent(factory.notificationClass)
  })

  test('rejects unsafe stored and command recipients before delivery').with(factories).run(async ({ assert, cleanup }, factory) => {
    mail.fake()
    cleanup(() => mail.restore())
    const notification = factory.create(userWithEmail('"user"@example.com'))
    await assert.rejects(() => mail.send(notification), 'A valid single mailbox address is required')
    // The fake records attempts before prepare; rejection must leave To unset.
    assert.isUndefined(notification.message.nodeMailerMessage.to)
  })
})
