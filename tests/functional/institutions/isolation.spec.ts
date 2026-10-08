import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import Account from '#models/Account'
import Institution from '#models/Institution'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

import app from '@adonisjs/core/services/app'
import PlaidWrapper from '#providers/Plaid/Plaid'
import * as Plaid from 'plaid'
let sequence = 0

async function createDomain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `institution-isolation-${label}-${++sequence}`,
      email: `institution-isolation-${sequence}@example.com`,
      password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: `${label} bank`, institutionId: `provider-${label}`, accessToken: `test-token-${label}`, plaidItemId: `item-${label}`, cursor: `cursor-${label}` })
    const account = await institution.related('accounts').create({
      name: `${label} account`, plaidAccountId: `provider-account-${label}-${sequence}`, balance: 100, type: AccountType.Depository,
      subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const group = await budget.related('groups').create({ name: `${label} group`, type: 'Regular' })
    const category = await group.related('categories').create({
      name: `${label} category`, type: CategoryType.Regular, balance: 20, fundingCategories: [],
    })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, comment: `${label} private comment`,
      categories: [{ categoryId: category.id, amount: 10 }], taxes: [],
    })
    const accountTransaction = await account.related('accountTransactions').create({
      transactionId: transaction.id, name: `${label} private purchase`, amount: 10,
      provider: 'PLAID', providerTransactionId: `provider-transaction-${label}`, pending: false, statementId: null,
    })
    const statement = await account.related('statements').create({
      startDate: DateTime.fromISO('2025-02-01'), endDate: DateTime.fromISO('2025-02-28'),
      startingBalance: 90, endingBalance: 100,
    })
    await account.related('balanceHistory').create({ date: DateTime.fromISO('2025-01-01'), balance: 100 })
    return { budget, user, institution, account, category, transaction, accountTransaction, statement }
  })
}

async function createFixture() {
  const own = await createDomain('own')
  const foreign = await createDomain('foreign')
  const shared = await User.create({
    username: `institution-isolation-shared-${++sequence}`, email: `institution-isolation-${sequence}@example.com`,
    password: 'testPassw0rd', budgetId: own.budget.id,
  })
  return { own, foreign, shared }
}


class PlaidFake extends PlaidWrapper {
  calls: { method: string, resource: string | number | null }[] = []
  accounts: Plaid.AccountBase[] = []

  async getAccounts(institution: Institution): Promise<Plaid.AccountsGetResponse> {
    this.calls.push({ method: 'getAccounts', resource: institution.id })
    return { accounts: this.accounts, request_id: 'test', item: {
      item_id: 'test-item', webhook: null, error: null, available_products: [], billed_products: [],
      consent_expiration_time: null, update_type: Plaid.ItemUpdateTypeEnum.Background,
    } }
  }

  async exchangePublicToken(token: string): Promise<Plaid.ItemPublicTokenExchangeResponse> {
    this.calls.push({ method: 'exchangePublicToken', resource: token })
    return { access_token: 'test-new-token', item_id: 'test-new-item', request_id: 'test' }
  }

  async getInstitutionById(id: string): Promise<Plaid.InstitutionsGetByIdResponse> {
    this.calls.push({ method: 'getInstitutionById', resource: id })
    return { request_id: 'test', institution: { institution_id: id, name: 'Test provider bank', products: [],
      country_codes: [Plaid.CountryCode.Us], routing_numbers: [], oauth: false,
      connection_availability: Plaid.InstitutionConnectionAvailability.Supported } }
  }

  async createLinkToken(options: Plaid.LinkTokenCreateRequest): Promise<Plaid.LinkTokenCreateResponse> {
    this.calls.push({ method: 'createLinkToken', resource: options.access_token ?? null })
    return { link_token: 'test-link-token', expiration: '2030-01-01', request_id: 'test' }
  }

  async syncTransactions(institution: Institution): Promise<Plaid.TransactionsSyncResponse> {
    this.calls.push({ method: 'syncTransactions', resource: institution.id })
    return { accounts: [], added: [], modified: [], removed: [], next_cursor: 'test-cursor', has_more: false,
      transactions_update_status: Plaid.TransactionsUpdateStatus.HistoricalUpdateComplete, request_id: 'test' }
  }

  async removeItem(token: string): Promise<Plaid.ItemRemoveResponse> {
    this.calls.push({ method: 'removeItem', resource: token })
    return { request_id: 'test' }
  }
}

test.group('Institution isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  let fake: PlaidFake
  group.each.setup(async () => {
    fixture = await createFixture()
    fake = new PlaidFake(app.config.get('plaid'))
    app.container.swap(PlaidWrapper, () => fake)
    return () => app.container.restore(PlaidWrapper)
  })

  async function state() {
    const budgets = [fixture.own.budget.id, fixture.foreign.budget.id]
    return Promise.all([
      db.from('institutions').whereIn('application_id', budgets).orderBy('id'),
      db.from('accounts').orderBy('id'), db.from('balance_histories').orderBy('id'),
      db.from('transactions').whereIn('application_id', budgets).orderBy('id'),
      db.from('account_transactions').orderBy('id'), db.from('statements').orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .whereIn('groups.application_id', budgets).orderBy('categories.id'),
      db.from('transaction_logs').whereIn('application_id', budgets).orderBy('id'),
      db.from('plaid_logs').orderBy('id'),
    ])
  }


  function providerAccount(id: string): Plaid.AccountBase {
    return { account_id: id, name: 'Provider returned account', official_name: 'Provider official name',
      mask: '1234', type: Plaid.AccountType.Depository, subtype: Plaid.AccountSubtype.Checking,
      balances: { current: 75, available: 75, limit: null, iso_currency_code: 'USD', unofficial_currency_code: null } }
  }

  test('provider collisions reject another institution account and roll back the whole batch')
    .with(['create', 'refresh'].flatMap((path) => ['foreign-budget', 'same-budget'].flatMap((scope) =>
      ['single', 'mixed'].map((batch) => ({ path, scope, batch })))))
    .run(async ({ client, assert }, scenario) => {
      const collider = scenario.scope === 'foreign-budget' ? fixture.foreign : fixture.own
      const target = scenario.scope === 'same-budget'
        ? await fixture.own.budget.related('institutions').create({ name: 'Other own link', accessToken: 'other-token', plaidItemId: 'other-item' })
        : fixture.own.institution
      const providerId = collider.account.plaidAccountId
      if (!providerId) throw new Error('Fixture must have a provider account ID')
      fake.accounts = scenario.batch === 'mixed'
        ? [providerAccount(`new-account-before-collision-${sequence}`), providerAccount(providerId)] : [providerAccount(providerId)]
      const before = await state()
      const request = client.post(scenario.path === 'create' ? '/api/v1/institution' : `/api/v1/institution/${target.id}`)
        .accept('json').loginAs(fixture.shared)
      if (scenario.path === 'create') request.json({ publicToken: 'test-public-token', institutionId: 'test-provider-bank' })
      const response = await request
      const returned = scenario.path === 'create' ? response.body().data?.accounts : response.body().accounts
      if (Array.isArray(returned)) {
        assert.isFalse(returned.some((account: { id: number }) => account.id === collider.account.id))
      }
      response.assertStatus(409)
      assert.notInclude(response.text(), collider.account.name)
      assert.notInclude(response.text(), collider.institution.name)
      assert.notInclude(response.text(), providerId)
      assert.notInclude(response.text(), collider.user.username)
      assert.deepEqual(await state(), before)
      assert.isFalse(fake.calls.some((call) => call.method === 'syncTransactions'))
      assert.equal(fake.calls.filter((call) => call.method === 'removeItem').length, scenario.path === 'create' ? 1 : 0)
    })

  test('owner/shared provider creation and refresh create only institution-owned accounts')
    .with(['create', 'refresh'].flatMap((path) => ['owner', 'shared'].map((actor) => ({ path, actor }))))
    .run(async ({ client, assert }, scenario) => {
      const foreignBefore = await Account.findOrFail(fixture.foreign.account.id)
      const before = await state()
      fake.accounts = [providerAccount(`new-distinct-provider-account-${sequence}`)]
      const request = client.post(scenario.path === 'create' ? '/api/v1/institution' : `/api/v1/institution/${fixture.own.institution.id}`)
        .accept('json').loginAs(scenario.actor === 'owner' ? fixture.own.user : fixture.shared)
      if (scenario.path === 'create') request.json({ publicToken: 'test-public-token', institutionId: 'test-provider-bank' })
      const response = await request
      response.assertStatus(200)
      const body = scenario.path === 'create' ? response.body().data : response.body()
      assert.lengthOf(body.accounts, 1)
      const account = await Account.findOrFail(body.accounts[0].id)
      assert.equal(account.institutionId, body.id)
      assert.equal((await Institution.findOrFail(account.institutionId)).budgetId, fixture.own.budget.id)
      assert.equal(account.balance, 75)
      assert.equal(account.name, 'Provider returned account')
      assert.deepEqual((await Account.findOrFail(fixture.foreign.account.id)).$attributes, foreignBefore.$attributes)
      const after = await state()
      assert.deepEqual(after.slice(2), before.slice(2))
      assert.equal(fake.calls.filter((call) => call.method === 'syncTransactions').length, scenario.path === 'create' ? 1 : 0)
    })

  test('refresh reuses only the same institution account for owner/shared users')
    .with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
      const providerId = fixture.own.account.plaidAccountId
      if (!providerId) throw new Error('Fixture must have a provider account ID')
      fake.accounts = [providerAccount(providerId), providerAccount(providerId)]
      const before = await state()
      const response = await client.post(`/api/v1/institution/${fixture.own.institution.id}`)
        .accept('json').loginAs(actor === 'owner' ? fixture.own.user : fixture.shared)
      response.assertStatus(200)
      assert.deepEqual(response.body().accounts.map((account: { id: number }) => account.id), [fixture.own.account.id, fixture.own.account.id])
      assert.deepEqual(await state(), before)
    })

  const accountBody = { name: 'New account', balance: 50, type: AccountType.Depository,
    subtype: 'checking', tracking: TrackingType.Balances, startDate: '2025-01-01', rate: 0 }
  interface Operation { name: string, method: 'get' | 'post' | 'patch' | 'delete', suffix: string, body?: object }
  const operations: Operation[] = [
    { name: 'PATCH', method: 'patch', suffix: '', body: { name: 'Changed institution' } },
    { name: 'provider account refresh', method: 'post', suffix: '' },
    { name: 'account creation', method: 'post', suffix: '/accounts', body: accountBody },
    { name: 'account listing', method: 'get', suffix: '/accounts' },
    { name: 'provider info', method: 'get', suffix: '/info' },
    { name: 'update-mode Link token', method: 'get', suffix: '/link-token' },
    { name: 'transaction sync', method: 'post', suffix: '/accounts/2147483647/transactions/sync' },
    { name: 'unlink', method: 'post', suffix: '/unlink' },
    { name: 'DELETE', method: 'delete', suffix: '' },
  ]
  test('rejects inaccessible institution operations before any provider call or mutation')
    .with(operations.flatMap((operation) => ['foreign', 'missing'].map((target) => ({ ...operation, target }))))
    .run(async ({ client, assert }, operation) => {
      const id = operation.target === 'foreign' ? fixture.foreign.institution.id : 2147483647
      const before = await state()
      const request = client[operation.method](`/api/v1/institution/${id}${operation.suffix}`).accept('json').loginAs(fixture.own.user)
      if (operation.body) request.json(operation.body)
      const response = await request
      assert.deepEqual(fake.calls, [])
      assert.deepEqual(await state(), before)
      response.assertStatus(404)
    })

  test('account deletion requires an owned institution and its own child account').with([
    'both foreign', 'own institution foreign account', 'foreign institution own account', 'same budget wrong parent', 'missing account', 'missing institution',
  ]).run(async ({ client, assert }, scenario) => {
    let institutionId = fixture.own.institution.id
    let accountId = fixture.own.account.id
    if (scenario === 'both foreign' || scenario === 'foreign institution own account') institutionId = fixture.foreign.institution.id
    if (scenario === 'both foreign' || scenario === 'own institution foreign account') accountId = fixture.foreign.account.id
    if (scenario === 'missing account') accountId = 2147483647
    if (scenario === 'missing institution') institutionId = 2147483647
    if (scenario === 'same budget wrong parent') {
      const other = await fixture.own.budget.related('institutions').create({ name: 'Other own institution' })
      institutionId = other.id
    }
    const before = await state()
    const response = await client.delete(`/api/v1/institution/${institutionId}/accounts/${accountId}`).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(fake.calls, [])
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('owner and shared-budget users retain institution PATCH and account creation').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const user = actor === 'owner' ? fixture.own.user : fixture.shared
    const response = await client.patch(`/api/v1/institution/${fixture.own.institution.id}`).json({ name: 'Renamed own institution' }).accept('json').loginAs(user)
    response.assertStatus(200)
    assert.equal((await Institution.findOrFail(fixture.own.institution.id)).name, 'Renamed own institution')
    const created = await client.post(`/api/v1/institution/${fixture.own.institution.id}/accounts`).json(accountBody).accept('json').loginAs(user)
    created.assertStatus(200)
    assert.equal((await Account.findOrFail(created.body().data.account.id)).institutionId, fixture.own.institution.id)
    assert.equal((await Account.findOrFail(created.body().data.account.id)).balance, 50)
    assert.equal((await Institution.findOrFail(fixture.foreign.institution.id)).name, 'foreign bank')
    assert.deepEqual(fake.calls, [])
  })

  test('authorized listing, refresh and Link token use only the own institution', async ({ client, assert }) => {
    const before = await state()
    const prefix = `/api/v1/institution/${fixture.own.institution.id}`
    const listed = await client.get(`${prefix}/accounts`).accept('json').loginAs(fixture.shared)
    listed.assertStatus(200)
    const refreshed = await client.post(prefix).accept('json').loginAs(fixture.shared)
    refreshed.assertStatus(200)
    const linked = await client.get(`${prefix}/link-token`).accept('json').loginAs(fixture.shared)
    linked.assertStatus(200)
    assert.equal(linked.body().linkToken, 'test-link-token')
    assert.deepEqual(fake.calls, [{ method: 'getAccounts', resource: fixture.own.institution.id },
      { method: 'getAccounts', resource: fixture.own.institution.id }, { method: 'createLinkToken', resource: 'test-token-own' }])
    assert.deepEqual(await state(), before)
  })

  test('sync is institution-wide and the unused account parameter does not select resources').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const foreignBefore = await Institution.findOrFail(fixture.foreign.institution.id)
    const response = await client.post(`/api/v1/institution/${fixture.own.institution.id}/accounts/${fixture.foreign.account.id}/transactions/sync`)
      .accept('json').loginAs(actor === 'owner' ? fixture.own.user : fixture.shared)
    response.assertStatus(200)
    assert.deepEqual(fake.calls, [{ method: 'syncTransactions', resource: fixture.own.institution.id }])
    assert.equal((await Institution.findOrFail(fixture.own.institution.id)).cursor, 'test-cursor')
    assert.equal((await Institution.findOrFail(fixture.foreign.institution.id)).cursor, foreignBefore.cursor)
    assert.equal((await Account.findOrFail(fixture.foreign.account.id)).balance, 100)
  })

  test('syncAll selects only connected institutions from the authenticated budget', async ({ client, assert }) => {
    const before = await state()
    const response = await client.post('/api/v1/institutions/sync').accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.deepEqual(fake.calls, [{ method: 'syncTransactions', resource: fixture.own.institution.id }])
    assert.equal((await Institution.findOrFail(fixture.own.institution.id)).cursor, 'test-cursor')
    assert.equal((await Institution.findOrFail(fixture.foreign.institution.id)).cursor, 'cursor-foreign')
    const after = await state()
    assert.deepEqual(after.slice(1), before.slice(1))
  })

  test('shared-budget unlink preserves financial data while clearing only own connection state', async ({ client, assert }) => {
    const response = await client.post(`/api/v1/institution/${fixture.own.institution.id}/unlink`).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.deepEqual(fake.calls, [{ method: 'removeItem', resource: 'test-token-own' }])
    const institution = await Institution.findOrFail(fixture.own.institution.id)
    assert.isNull(institution.accessToken)
    assert.isNull(institution.cursor)
    assert.isNull((await Account.findOrFail(fixture.own.account.id)).plaidAccountId)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 100)
    assert.equal((await Institution.findOrFail(fixture.foreign.institution.id)).accessToken, 'test-token-foreign')
  })

  test('shared-budget institution info uses its provider ID', async ({ client, assert }) => {
    const response = await client.get(`/api/v1/institution/${fixture.own.institution.id}/info`).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.equal(response.body().institution_id, 'provider-own')
    assert.deepEqual(fake.calls, [{ method: 'getInstitutionById', resource: 'provider-own' }])
  })

  test('shared-budget institution deletion removes only own financial records', async ({ client, assert }) => {
    const response = await client.delete(`/api/v1/institution/${fixture.own.institution.id}`).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.isNull(await Institution.find(fixture.own.institution.id))
    assert.isNull(await Account.find(fixture.own.account.id))
    assert.isNull(await Transaction.find(fixture.own.transaction.id))
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 10)
    assert.equal((await Account.findOrFail(fixture.foreign.account.id)).balance, 100)
    assert.deepEqual(fake.calls, [{ method: 'removeItem', resource: 'test-token-own' }])
  })

  test('shared-budget account deletion preserves foreign records', async ({ client, assert }) => {
    const response = await client.delete(`/api/v1/institution/${fixture.own.institution.id}/accounts/${fixture.own.account.id}`)
      .accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.isNull(await Account.find(fixture.own.account.id))
    assert.isNull(await Transaction.find(fixture.own.transaction.id))
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 10)
    assert.equal((await Account.findOrFail(fixture.foreign.account.id)).balance, 100)
    assert.deepEqual(fake.calls, [])
  })
})
