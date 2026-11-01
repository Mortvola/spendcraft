import { test } from '@japa/runner'
import { mock } from 'node:test'
import { Exception } from '@adonisjs/core/exceptions'
import { ExceptionHandler, type HttpContext } from '@adonisjs/core/http'
import { HttpContextFactory } from '@adonisjs/http-server/factories'
import { errors as authErrors } from '@adonisjs/auth'
import vine from '@vinejs/vine'
import Handler from '#exceptions/Handler'

function context(path = '/api/v1/user', accept = 'application/json') {
  const ctx = new HttpContextFactory().merge({ url: path }).create()
  ctx.request.request.headers.accept = accept
  return ctx
}

test.group('SpendCraft API exception responses', () => {
  test('preserves client-error statuses and codes').with([400, 403, 404, 409, 422, 429])
    .run(async ({ assert }, status) => {
      const ctx = context()
      await new Handler().handle(new Exception('Request rejected', { status,
        code: 'E_REQUEST_REJECTED' }), ctx)
      assert.equal(ctx.response.getStatus(), status)
      assert.deepEqual(ctx.response.getBody(), { errors: [{ message: 'Request rejected',
        code: 'E_REQUEST_REJECTED' }] })
      assert.include(String(ctx.response.getHeader('content-type')), 'application/json')
    })

  test('handles self-rendering authentication failures consistently').with([
    'text/html', 'application/json', 'application/vnd.api+json', '*/*',
  ]).run(async ({ assert }, accept) => {
    const ctx = context('/api/v1/user', accept)
    await new Handler().handle(new authErrors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
      guardDriverName: 'jwt',
    }), ctx)
    assert.equal(ctx.response.getStatus(), 401)
    assert.deepEqual(ctx.response.getBody(), { errors: [{ message: 'Unauthorized access',
      code: 'E_UNAUTHORIZED_ACCESS' }] })
  })

  test('does not leak server error details even when debug rendering is enabled').with([
    new Error('password=private SQL connection failed'),
    new Exception('Private service failure', { status: 503, code: 'INTERNAL_SECRET' }),
  ]).run(async ({ assert }, error) => {
    const ctx = context()
    class DebugHandler extends Handler { protected debug = true }
    await new DebugHandler().handle(error, ctx)
    assert.equal(ctx.response.getStatus(), 'status' in error ? error.status : 500)
    assert.deepEqual(ctx.response.getBody(), { errors: [{ message: 'Internal server error' }] })
  })

  test('preserves native validation messages and indexed field metadata').with([
    'text/html', 'application/json', 'application/vnd.api+json',
  ]).run(async ({ assert }, accept) => {
    const ctx = context('/api/v1/transaction/1', accept)
    const validator = vine.compile(vine.object({ categories: vine.array(vine.object({
      amount: vine.number().min(1),
    })) }))
    const [error] = await validator.tryValidate({ categories: [{ amount: 0 }] })
    assert.isNotNull(error)
    await new Handler().handle(error, ctx)
    assert.equal(ctx.response.getStatus(), 422)
    assert.deepEqual(ctx.response.getBody(), { errors: error?.messages })
    assert.equal(ctx.response.getBody().errors[0].field, 'categories.0.amount')
    assert.deepEqual(ctx.response.getBody().errors[0].meta, { min: 1 })
  })

  test('delegates browser errors to the existing handler').with([
    '/', '/statements', '/api/v10/user', '/api/v1-other',
  ]).run(async ({ assert, cleanup }, path) => {
    const ctx = context(path, 'text/html')
    const error = new Exception('Not found', { status: 404 })
    const delegate = mock.method(ExceptionHandler.prototype, 'handle', async (value: unknown,
      request: HttpContext) => {
      assert.strictEqual(value, error)
      assert.strictEqual(request, ctx)
    })
    cleanup(() => delegate.mock.restore())
    await new Handler().handle(error, ctx)
    assert.equal(delegate.mock.callCount(), 1)
  })

  test('preserves production browser status-page rendering', async ({ assert }) => {
    const ctx = context('/missing-page', 'text/html')
    const renders: string[] = []
    Object.defineProperty(ctx, 'view', { value: { render: async (template: string) => {
      renders.push(template)
      return '<html>Not found</html>'
    } } })
    class ProductionHandler extends Handler { protected renderStatusPages = true }
    await new ProductionHandler().handle(new Exception('Not found', { status: 404 }), ctx)
    assert.deepEqual(renders, ['errors/not-found'])
    assert.equal(ctx.response.getStatus(), 404)
    assert.equal(ctx.response.getBody(), '<html>Not found</html>')
  })

  test('reporting receives the original exception', async ({ assert, cleanup }) => {
    const ctx = context()
    const error = new Error('Private diagnostic details')
    const report = mock.method(ExceptionHandler.prototype, 'report', async (value: unknown,
      request: HttpContext) => {
      assert.strictEqual(value, error)
      assert.strictEqual(request, ctx)
    })
    cleanup(() => report.mock.restore())
    const handler = new Handler()
    await handler.handle(error, ctx)
    await handler.report(error, ctx)
    assert.equal(report.mock.callCount(), 1)
    assert.equal(error.message, 'Private diagnostic details')
  })
})
