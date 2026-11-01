import { test } from '@japa/runner'
import { mock } from 'node:test'
import { DateTime } from 'luxon'
import { HttpContextFactory } from '@adonisjs/http-server/factories'
import mail from '@adonisjs/mail/services/main'
import redis from '@adonisjs/redis/services/main'
import User from '#models/User'
import AuthController from '#controllers/AuthController'
import { JwtGuard } from '#app/auth/guards/JwtGuard'

function gate() {
  let release: () => void = () => { throw new Error('Gate not initialized') }
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

test('auth operations await completion and propagate asynchronous failures').with(
  ['logout', 'request code', 'verify email'].flatMap(operation => [false, true].map(fail => ({
    operation, fail })))
).run(async ({ assert, cleanup }, { operation, fail }) => {
  const entered = gate()
  const finish = gate()
  const failure = new Error('Asynchronous operation failed')
  let completed = false
  let rendered = false
  const user = new User()
  user.id = 1; user.password = 'test-secret'; user.email = 'auth-await@example.com'
  user.createdAt = DateTime.now(); user.activated = false
  const ctx = new HttpContextFactory().create()
  ctx.params = { id: user.id, token: String(user.generateToken()) }
  const validate = mock.method(ctx.request, 'validateUsing', async () => ({
    email: user.email, data: { refresh: 'auth-await-token' },
  }))
  cleanup(() => validate.mock.restore())
  const pending = async () => {
    entered.release()
    await finish.promise
    if (fail) throw failure
  }
  if (operation === 'logout') {
    const remove = mock.method(redis, 'del', async (key: string) => {
      assert.equal(key, 'jwt_refresh:auth-await-token')
      await pending()
      return 1
    })
    cleanup(() => remove.mock.restore())
    Object.defineProperty(ctx, 'auth', { value: { use: () => ({
      revoke: (token: string) => JwtGuard.prototype.revoke(token),
    }) } })
  } else if (operation === 'request code') {
    const find = mock.method(User, 'findBy', async () => user)
    const save = mock.method(user, 'save', async () => user)
    const send = mock.method(mail, 'send', async () => { await pending() })
    cleanup(() => { find.mock.restore(); save.mock.restore(); send.mock.restore() })
  } else {
    const find = mock.method(User, 'find', async () => user)
    const save = mock.method(user, 'save', async () => { await pending(); return user })
    cleanup(() => { find.mock.restore(); save.mock.restore() })
    Object.defineProperty(ctx, 'view', { value: { render: () => {
      rendered = true
      return '<html>Verified</html>'
    } } })
  }
  const controller = new AuthController()
  const run = operation === 'logout' ? controller.logout(ctx)
    : operation === 'request code' ? controller.requestCode(ctx) : controller.verifyEmail(ctx)
  const result = run.then(value => { completed = true; return { value, error: null } },
    (error: unknown) => { completed = true; return { value: undefined, error } })
  try {
    await Promise.race([entered.promise, result.then(() => {
      throw new Error('Operation completed before reaching the pending side effect')
    })])
    assert.isFalse(completed)
    assert.isFalse(rendered)
  } finally { finish.release() }
  const outcome = await result
  assert.strictEqual(outcome.error, fail ? failure : null)
  assert.isTrue(completed)
  assert.equal(rendered, operation === 'verify email' && !fail)
})
