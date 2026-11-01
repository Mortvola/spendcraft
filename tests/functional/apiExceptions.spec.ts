import User from '#models/User'
import { mock } from 'node:test'
import { JwtGuard } from '#app/auth/guards/JwtGuard'
import { errors } from '@adonisjs/auth'
import { test } from '@japa/runner'

test.group('SpendCraft API exception HTTP responses', () => {
  test('unknown API routes return the error wrapper even when HTML is requested', async ({
    client, assert }) => {
    const response = await client.get('/api/v1/missing-exception-route').accept('html')
    response.assertStatus(404)
    assert.isString(response.body().errors[0].message)
    assert.equal(response.body().errors[0].code, 'E_ROUTE_NOT_FOUND')
    assert.include(response.header('content-type'), 'application/json')
  })

  test('protected API routes return wrapped authentication errors', async ({ client, assert }) => {
    const response = await client.get('/api/v1/user').accept('html')
    response.assertStatus(401)
    assert.deepEqual(response.body(), { errors: [{ message: 'Unauthorized access',
      code: 'E_UNAUTHORIZED_ACCESS' }] })
  })

  test('validation failures preserve native fields and messages', async ({ client, assert }) => {
    const response = await client.post('/api/v1/login').accept('html')
    response.assertStatus(422)
    assert.sameMembers(response.body().errors.map((error: { field: string }) => error.field), [
      'username', 'password',
    ])
    for (const error of response.body().errors) {
      assert.isString(error.message)
      assert.equal(error.rule, 'required')
    }
  })
})

test.group('Refresh token error responses', () => {
  test('failed refresh returns a safe error wrapper').with(['invalid', 'expired'])
    .run(async ({ client, assert, cleanup }, token) => {
      const refresh = mock.method(JwtGuard.prototype, 'loginViaRefreshToken', async (
        value: string) => {
        assert.equal(value, token)
        throw new errors.E_UNAUTHORIZED_ACCESS(`Private token diagnostic: ${value}`, {
          guardDriverName: 'jwt',
        })
      })
      cleanup(() => refresh.mock.restore())
      const response = await client.post('/api/v1/refresh').json({ data: { refresh: token } })
        .accept('json')
      response.assertStatus(401)
      assert.deepEqual(response.body(), { errors: [{
        message: 'Your session has expired. Please sign in again.', code: 'E_UNAUTHORIZED_ACCESS',
      }] })
      assert.include(response.header('content-type'), 'application/json')
      assert.equal(refresh.mock.callCount(), 1)
    })

  test('unexpected refresh failures return safe HTTP 500 errors')
    .with(['Private Redis connection failure', 'Private token-generation failure'])
    .run(async ({ client, assert, cleanup }, message) => {
      const refresh = mock.method(JwtGuard.prototype, 'loginViaRefreshToken', async () => {
        throw new Error(message)
      })
      cleanup(() => refresh.mock.restore())
      const response = await client.post('/api/v1/refresh').json({ data: {
        refresh: 'current-refresh-token',
      } }).accept('json')
      response.assertStatus(500)
      assert.deepEqual(response.body(), { errors: [{ message: 'Internal server error' }] })
      assert.equal(refresh.mock.callCount(), 1)
    })

  test('successful refresh preserves the token response', async ({ client, assert, cleanup }) => {
    const refresh = mock.method(JwtGuard.prototype, 'loginViaRefreshToken', async (
      token: string) => {
      assert.equal(token, 'current-refresh-token')
      return { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' }
    })
    cleanup(() => refresh.mock.restore())
    const response = await client.post('/api/v1/refresh').json({ data: {
      refresh: 'current-refresh-token',
    } }).accept('json')
    response.assertStatus(200)
    assert.deepEqual(response.body(), { data: { access: 'new-access-token',
      refresh: 'new-refresh-token' } })
    assert.equal(refresh.mock.callCount(), 1)
  })

  test('invalid refresh payload remains a validation error', async ({ client, assert,
    cleanup }) => {
    const refresh = mock.method(JwtGuard.prototype, 'loginViaRefreshToken', async () => {
      throw new Error('Refresh must not run for invalid input')
    })
    cleanup(() => refresh.mock.restore())
    const response = await client.post('/api/v1/refresh').json({ data: {} }).accept('json')
    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'data.refresh')
    assert.equal(response.body().errors[0].rule, 'required')
    assert.equal(refresh.mock.callCount(), 0)
  })
})

test.group('Login error responses', () => {
  test('invalid credentials return the existing field messages with HTTP 401', async ({ client,
    assert, cleanup }) => {
    const verify = mock.method(User, 'verifyCredentials', async () => {
      throw new errors.E_INVALID_CREDENTIALS('Invalid user credentials')
    })
    const generate = mock.method(JwtGuard.prototype, 'generate', async () => {
      throw new Error('Tokens must not be generated for invalid credentials')
    })
    cleanup(() => { verify.mock.restore(); generate.mock.restore() })
    const response = await client.post('/api/v1/login').json({ username: 'invalid-user',
      password: 'invalid-password' }).accept('json')
    response.assertStatus(401)
    assert.deepEqual(response.body(), { errors: [
      { field: 'username', message: 'The username or password does not match our records.' },
      { field: 'password', message: 'The username or password does not match our records.' },
    ] })
    assert.equal(generate.mock.callCount(), 0)
  })

  test('unexpected verification and token errors reach the safe HTTP 500 handler')
    .with(['verification', 'token generation']).run(async ({ client, assert, cleanup }, phase) => {
      const user = new User()
      const failure = new Error('Private database or signing-key diagnostic')
      const verify = mock.method(User, 'verifyCredentials', async () => {
        if (phase === 'verification') throw failure
        return user
      })
      const generate = mock.method(JwtGuard.prototype, 'generate', async () => { throw failure })
      cleanup(() => { verify.mock.restore(); generate.mock.restore() })
      const response = await client.post('/api/v1/login').json({ username: 'test-user',
        password: 'test-password' }).accept('json')
      response.assertStatus(500)
      assert.deepEqual(response.body(), { errors: [{ message: 'Internal server error' }] })
      assert.equal(generate.mock.callCount(), phase === 'verification' ? 0 : 1)
    })

  test('successful login preserves the token response', async ({ client, assert, cleanup }) => {
    const user = new User()
    const verify = mock.method(User, 'verifyCredentials', async (username: string,
      password: string) => {
      assert.equal(username, 'test-user')
      assert.equal(password, 'test-password')
      return user
    })
    const generate = mock.method(JwtGuard.prototype, 'generate', async (authenticated: User) => {
      assert.strictEqual(authenticated, user)
      return { accessToken: 'access-token', refreshToken: 'refresh-token' }
    })
    cleanup(() => { verify.mock.restore(); generate.mock.restore() })
    const response = await client.post('/api/v1/login').json({ username: 'test-user',
      password: 'test-password' }).accept('json')
    response.assertStatus(200)
    assert.deepEqual(response.body(), { data: { access: 'access-token',
      refresh: 'refresh-token' } })
  })
})
