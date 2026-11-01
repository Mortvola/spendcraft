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
