import { test } from '@japa/runner'
import { mock } from 'node:test'
import { Logger } from '@adonisjs/core/logger'
import PlaidWrapper from '#providers/Plaid/Plaid'
import PlaidException from '#providers/Plaid/PlaidException'
import Institution from '#models/Institution'
import app from '@adonisjs/core/services/app'
import * as Plaid from 'plaid'

const institution = new Institution()
institution.accessToken = 'fake-sensitive-token'
institution.institutionId = 'fake-bank'

const calls = [
  { sdk: 'itemGet', call: (p: PlaidWrapper) => p.getItem(institution) },
  { sdk: 'itemRemove', call: (p: PlaidWrapper) => p.removeItem('fake-sensitive-token') },
  { sdk: 'accountsGet', call: (p: PlaidWrapper) => p.getAccounts(institution) },
  { sdk: 'itemPublicTokenExchange', call: (p: PlaidWrapper) => p.exchangePublicToken('fake-public-token') },
  { sdk: 'linkTokenCreate', call: (p: PlaidWrapper) => p.createLinkToken({ client_name: 'Test', language: 'en', country_codes: [Plaid.CountryCode.Us], user: { client_user_id: 'test' } }) },
  { sdk: 'webhookVerificationKeyGet', call: (p: PlaidWrapper) => p.getWebhookVerificationKey('fake-key') },
  { sdk: 'accountsBalanceGet', call: (p: PlaidWrapper) => p.getBalance(institution) },
  { sdk: 'transactionsSync', call: (p: PlaidWrapper) => p.syncTransactions(institution, null) },
  { sdk: 'transactionsGet', call: (p: PlaidWrapper) => p.getTransactions(institution, '2025-01-01', '2025-01-31') },
  { sdk: 'transactionsRefresh', call: (p: PlaidWrapper) => p.refreshTransactions(institution) },
  { sdk: 'institutionsGetById', call: (p: PlaidWrapper) => p.getInstitutionById('fake-bank', [Plaid.CountryCode.Us]) },
  { sdk: 'institutionsSearch', call: (p: PlaidWrapper) => p.searchInstitutions('Bank') },
  { sdk: 'itemWebhookUpdate', call: (p: PlaidWrapper) => p.updateItemWebhook(institution, 'https://example.com/wh') },
  { sdk: 'sandboxItemResetLogin', call: (p: PlaidWrapper) => p.resetLogin(institution) },
  { sdk: 'sandboxItemFireWebhook', call: (p: PlaidWrapper) => p.sandboxItemFireWebhook(institution, Plaid.SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable) },
  { sdk: 'categoriesGet', call: (p: PlaidWrapper) => p.getCategories() },
] as const

async function observed(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call()
    throw new Error('Expected provider call to reject')
  } catch (error) {
    return error
  }
}

test.group('Plaid provider error preservation', (group) => {
  let wrapper: PlaidWrapper
  let audit: ReturnType<typeof mock.method<typeof PlaidWrapper, 'log'>>
  group.each.setup(() => {
    wrapper = new PlaidWrapper(app.config.get('plaid'))
    audit = mock.method(PlaidWrapper, 'log', async () => { /* Isolate SDK behavior from provider audit persistence. */ })
    return () => audit.mock.restore()
  })

  test('each API wrapper preserves a response-less network error').with([...calls]).run(async ({ assert, cleanup }, entry) => {
    const error = Object.assign(new Error('connection reset'), { code: 'ECONNRESET', config: { headers: { 'PLAID-SECRET': 'fake-secret' } } })
    const sdk = mock.method(wrapper.plaid, entry.sdk, () => Promise.reject(error))
    cleanup(() => sdk.mock.restore())
    const actual = await observed(() => entry.call(wrapper))
    assert.instanceOf(actual, Error)
    if (!(actual instanceof Error)) throw new Error('Expected preserved error')
    assert.strictEqual(actual.cause, error)
    assert.equal(actual.message, error.message)
    assert.equal('code' in actual ? actual.code : undefined, error.code)
    assert.notInclude(JSON.stringify(actual), 'fake-secret')
    assert.isEmpty(audit.mock.calls)
  })

  test('sync preserves timeout, ordinary and unexpected thrown values').with([
    Object.assign(new Error('request timed out'), { code: 'ECONNABORTED' }),
    new Error('Unexpected SDK failure'), null, 'unexpected failure',
    { response: null }, { response: { status: 502, data: '<html>Bad Gateway</html>' } },
    { response: { status: 502, data: { error_message: 'Unstructured proxy failure' } } },
  ]).run(async ({ assert, cleanup }, error) => {
    const sdk = mock.method(wrapper.plaid, 'transactionsSync', () => Promise.reject(error))
    cleanup(() => sdk.mock.restore())
    const actual = await observed(() => wrapper.syncTransactions(institution, null))
    assert.instanceOf(actual, Error)
    if (!(actual instanceof Error)) throw new Error('Expected preserved error')
    assert.strictEqual(actual.cause, error)
    assert.notInstanceOf(actual, PlaidException)
    assert.isEmpty(audit.mock.calls)
  })

  test('structured Plaid metadata, status and cause remain available').with(['ITEM_LOGIN_REQUIRED', 'TRANSACTIONS_SYNC_ITEM_LIMIT_EXCEEDED']).run(async ({ assert, cleanup }, code) => {
    const data = { error_type: code === 'ITEM_LOGIN_REQUIRED' ? 'ITEM_ERROR' : 'TRANSACTIONS_ERROR', error_code: code, error_message: 'Provider failure', display_message: null, request_id: 'fake-request' }
    const error = Object.assign(new Error('Provider failure'), { status_code: 400, config: { headers: { 'PLAID-SECRET': 'fake-secret' } }, response: { status: 400, data, request: { path: '/transactions/sync' } } })
    const sdk = mock.method(wrapper.plaid, 'transactionsSync', () => Promise.reject(error))
    cleanup(() => sdk.mock.restore())
    const actual = await observed(() => wrapper.syncTransactions(institution, null))
    assert.instanceOf(actual, PlaidException)
    if (!(actual instanceof PlaidException)) throw new Error('Expected PlaidException')
    assert.strictEqual(actual.plaidError, data)
    assert.equal(actual.code, 'PLAID_ERROR')
    assert.equal(actual.status, 400)
    assert.equal(actual.message, data.error_message)
    assert.strictEqual(actual.cause, error)
    assert.deepEqual(audit.mock.calls[0].arguments, ['/transactions/sync', data, 400, institution.institutionId])
    assert.notInclude(JSON.stringify(audit.mock.calls[0].arguments), 'fake-secret')
  })

  test('normal SDK HTTP envelope preserves metadata and the existing default application status', async ({ assert, cleanup }) => {
    const data = { error_type: 'API_ERROR', error_code: 'INTERNAL_SERVER_ERROR', error_message: 'Provider unavailable', request_id: 'fake-request' }
    const original = Object.assign(new Error('Request failed with status code 503'), { response: { status: 503, data } })
    const sdk = mock.method(wrapper.plaid, 'transactionsSync', () => Promise.reject(original))
    cleanup(() => sdk.mock.restore())
    const error = await observed(() => wrapper.syncTransactions(institution, null))
    assert.instanceOf(error, PlaidException)
    if (!(error instanceof PlaidException)) throw new Error('Expected PlaidException')
    assert.strictEqual(error.plaidError, data)
    assert.strictEqual(error.cause, original)
    // Existing PlaidException uses the legacy status_code or Adonis's 500 default.
    assert.equal(error.status, 500)
    assert.deepEqual(audit.mock.calls[0].arguments, ['', data, 503, institution.institutionId])
  })

  test('structured and transport error logging excludes request credentials', async ({ assert, cleanup }) => {
    const output: string[] = []
    const log = new Logger({ enabled: true, level: 'error', destination: { write: (line: string) => { output.push(line) } } })
    const original = Object.assign(new Error('connection reset'), { code: 'ECONNRESET', config: { headers: { Authorization: 'fake-authorization-secret', 'PLAID-SECRET': 'fake-provider-secret' }, data: { access_token: 'fake-access-token' } }, request: { body: 'fake-webhook-payload' } })
    const sdk = mock.method(wrapper.plaid, 'transactionsSync', () => Promise.reject(original))
    cleanup(() => sdk.mock.restore())
    const transport = await observed(() => wrapper.syncTransactions(institution, null))
    log.error({ err: transport }, 'sync failed')
    const structured = Object.assign(new Error('provider failure'), { config: original.config, response: { status: 400, data: { error_code: 'ITEM_LOGIN_REQUIRED', error_type: 'ITEM_ERROR', error_message: 'provider failure', request_id: 'safe-request-id' } } })
    log.error({ err: PlaidException.from(structured) }, 'sync failed')
    const serialized = output.join('')
    assert.include(serialized, 'ECONNRESET')
    assert.include(serialized, 'ITEM_LOGIN_REQUIRED')
    assert.include(serialized, 'safe-request-id')
    for (const secret of ['fake-authorization-secret', 'fake-provider-secret', 'fake-access-token', 'fake-webhook-payload']) assert.notInclude(serialized, secret)
  })

  test('successful SDK response remains unchanged', async ({ assert, cleanup }) => {
    const data: Plaid.TransactionsSyncResponse = { accounts: [], added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false, request_id: 'success', transactions_update_status: Plaid.TransactionsUpdateStatus.HistoricalUpdateComplete }
    // Use the successful SDK request shape without adding a direct Axios dependency.
    const sdk = mock.method(wrapper.plaid, 'transactionsSync', async () => ({ data, status: 200, statusText: 'OK', headers: {}, config: { headers: new Headers() }, request: { path: '/transactions/sync' } }))
    cleanup(() => sdk.mock.restore())
    assert.strictEqual(await wrapper.syncTransactions(institution, null), data)
    assert.deepEqual(audit.mock.calls[0].arguments, ['/transactions/sync', data, 200, institution.institutionId])
  })
})
