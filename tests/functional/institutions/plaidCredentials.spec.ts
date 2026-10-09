import { test } from '@japa/runner'
import { mock } from 'node:test'
import { Logger } from '@adonisjs/core/logger'
import testUtils from '@adonisjs/core/services/test_utils'
import app from '@adonisjs/core/services/app'
import PlaidWrapper from '#providers/Plaid/Plaid'
import PlaidException from '#providers/Plaid/PlaidException'
import PlaidLog from '#models/PlaidLog'
import WebhookLog from '#models/WebhookLog'
import Budget from '#models/Budget'
import * as Plaid from 'plaid'
import logger from '@adonisjs/core/services/logger'
import WebhookController from '#controllers/WebhookController'
import Institution from '#models/Institution'

const sentinel = 'TEST_PLAID_ACCESS_TOKEN_DO_NOT_LOG'
const keys = ['access_token', 'public_token', 'link_token', 'processor_token', 'client_id', 'secret', 'Authorization', 'PLAID-SECRET', 'PLAID-CLIENT-ID', 'accessToken', 'client_secret', 'Proxy-Authorization']

test.group('Plaid diagnostic credential protection', () => {
  test('audit persistence redacts a sensitive key').with(keys).run(async ({ assert }, key) => {
    await PlaidWrapper.log('/test', { [key]: sentinel, request_id: 'safe-request' }, 200)
    const row = await PlaidLog.query().orderBy('id', 'desc').firstOrFail()
    assert.notInclude(JSON.stringify(row.response), sentinel)
    assert.include(JSON.stringify(row.response), 'safe-request')
  })

  test('nested arrays are sanitized without changing safe metadata or the original response', async ({ assert }) => {
    const data = { request_id: 'safe-request', item_id: 'safe-item', access_token_expiration: '2030', public_token_count: 2, data: [{ headers: { Authorization: sentinel }, account_id: 'safe-account' }] }
    await PlaidWrapper.log('/test', data, 200)
    const row = await PlaidLog.query().orderBy('id', 'desc').firstOrFail()
    assert.notInclude(JSON.stringify(row.response), sentinel)
    for (const value of ['safe-request', 'safe-item', '2030', 'public_token_count', 'safe-account']) assert.include(JSON.stringify(row.response), value)
    assert.equal(data.data[0].headers.Authorization, sentinel)
  })

  test('token exchange and Link retain their functional tokens but not audit credentials', async ({ assert, cleanup }) => {
    const wrapper = new PlaidWrapper(app.config.get('plaid'))
    const exchange = mock.method(wrapper.plaid, 'itemPublicTokenExchange', async () => ({ data: { access_token: sentinel, item_id: 'safe-item', request_id: 'exchange' }, status: 200, request: { path: '/item/public_token/exchange' } }))
    const link = mock.method(wrapper.plaid, 'linkTokenCreate', async () => ({ data: { link_token: sentinel, expiration: '2030', request_id: 'link' }, status: 200, request: { path: '/link/token/create' } }))
    cleanup(() => { exchange.mock.restore(); link.mock.restore() })
    assert.equal((await wrapper.exchangePublicToken('fake-public')).access_token, sentinel)
    assert.equal((await wrapper.createLinkToken({ client_name: 'Test', language: 'en', country_codes: [Plaid.CountryCode.Us], user: { client_user_id: 'test' } })).link_token, sentinel)
    const rows = await PlaidLog.query().whereIn('request', ['/item/public_token/exchange', '/link/token/create'])
    assert.lengthOf(rows, 2)
    assert.notInclude(JSON.stringify(rows), sentinel)
  })

  test('structured error audit, ordinary logger and HTTP exception serialization exclude credentials').with(['audit', 'logger', 'http']).run(async ({ assert }, destination) => {
    const data = { error_code: 'ITEM_LOGIN_REQUIRED', error_type: 'ITEM_ERROR', error_message: 'safe failure', request_id: 'safe-error-request', details: [{ access_token: sentinel }] }
    const original = Object.assign(new Error('safe failure'), { status_code: 400, response: { status: 400, data }, config: { headers: { Authorization: sentinel } } })
    const error = PlaidException.from(original)
    if (!(error instanceof PlaidException)) throw new Error('Expected structured error')
    await PlaidWrapper.log('/error', error.plaidError, 400)
    const row = await PlaidLog.query().orderBy('id', 'desc').firstOrFail()
    if (destination === 'audit') assert.notInclude(JSON.stringify(row.response), sentinel)
    const output: string[] = []
    const logger = new Logger({ enabled: true, level: 'error', destination: { write: (line: string) => { output.push(line) } } })
    logger.error({ err: error }, 'provider failed')
    if (destination === 'logger') assert.notInclude(output.join(''), sentinel)
    assert.include(output.join(''), 'safe-error-request')
    const ctx = await testUtils.createHttpContext()
    await error.handle(error, ctx)
    if (destination === 'http') assert.notInclude(JSON.stringify(ctx.response.getBody()), sentinel)
    assert.strictEqual(error.cause, original)
    assert.equal(data.details[0].access_token, sentinel)
  })

  test('webhook audit serialization excludes unexpected nested credential fields', async ({ assert }) => {
    const row = await WebhookLog.create({ request: { webhook_type: 'TRANSACTIONS', item_id: 'safe-item', data: [{ processor_token: sentinel }] } })
    await row.refresh()
    assert.notInclude(JSON.stringify(row.request), sentinel)
    assert.include(JSON.stringify(row.request), 'safe-item')
  })

  test('webhook application logging sanitizes credentials without changing the event', async ({ assert, cleanup }) => {
    const output = mock.method(logger, 'info', () => { /* Capture diagnostic output without writing it. */ })
    cleanup(() => output.mock.restore())
    const event = { webhook_type: 'TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE', item_id: 'safe-item', new_transactions: 0, removed_transactions: [], access_token: sentinel, error: { error_type: Plaid.PlaidErrorType.ItemError, error_code: 'TEST', error_message: 'safe message', display_message: null } }
    await WebhookController.processTransactionEvent(event)
    assert.notInclude(JSON.stringify(output.mock.calls.map((call) => call.arguments)), sentinel)
    assert.include(JSON.stringify(output.mock.calls.map((call) => call.arguments)), 'safe-item')
    assert.equal(event.access_token, sentinel)
  })

  test('failed SDK call uses the same sanitized audit boundary', async ({ assert, cleanup }) => {
    const wrapper = new PlaidWrapper(app.config.get('plaid'))
    const institution = new Institution()
    institution.accessToken = 'fake-input-token'
    const original = { response: { status: 400, data: { error_type: 'ITEM_ERROR', error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'safe failure', request_id: 'safe-sdk-error', details: [{ public_token: sentinel }] }, request: { path: '/transactions/sync' } } }
    const sdk = mock.method(wrapper.plaid, 'transactionsSync', () => Promise.reject(original))
    cleanup(() => sdk.mock.restore())
    await assert.rejects(() => wrapper.syncTransactions(institution, null), 'safe failure')
    const row = await PlaidLog.query().orderBy('id', 'desc').firstOrFail()
    assert.equal(row.status, 400)
    assert.notInclude(JSON.stringify(row.response), sentinel)
    assert.include(JSON.stringify(row.response), 'safe-sdk-error')
  })

  test('admin audit HTTP response contains safe diagnostics without credentials', async ({ client, assert }) => {
    const budget = await Budget.create({})
    const user = await budget.related('users').create({ username: 'credential-audit-admin', email: 'audit-admin@example.com', password: 'testPassw0rd', roles: ['ADMIN'] })
    await PlaidWrapper.log('/admin-test', { access_token: sentinel, request_id: 'safe-admin-request' }, 200)
    const response = await client.get('/api/v1/admin/plaid-logs').loginAs(user)
    response.assertStatus(200)
    assert.notInclude(JSON.stringify(response.body()), sentinel)
    assert.include(JSON.stringify(response.body()), 'safe-admin-request')
  })
})
