import Category from '#models/Category'
import { test } from '@japa/runner'
import { mock } from 'node:test'
import Budget from '#models/Budget'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Account from '#models/Account'
import Institution from '#models/Institution'
import transactionFields from '#controllers/transactionFields'

function accountTransaction() {
  return new AccountTransaction().merge({
    id: 10,
    accountId: 20,
    transactionId: 30,
    provider: 'PLAID',
    providerTransactionId: 'private-provider-id',
    name: 'Purchase',
    amount: 12.5,
    principle: null,
    pending: false,
    paymentChannel: 'online',
    merchantName: 'Shop',
    accountOwner: 'Owner',
    statementId: 40,
    location: null,
  })
}

test.group('Lucid transaction serialization', () => {
  test('preserves camelCase keys and hides private account transaction fields', ({ assert }) => {
    const row = accountTransaction()
    const expected = {
      accountId: 20,
      transactionId: 30,
      name: 'Purchase',
      amount: '12.50',
      principle: null,
      pending: false,
      paymentChannel: 'online',
      merchantName: 'Shop',
      accountOwner: 'Owner',
      statementId: 40,
      location: null,
    }
    assert.deepEqual(row.serialize(), expected)
    assert.deepEqual(JSON.parse(JSON.stringify(row)), expected)
    assert.notAnyProperties(row.serialize(), [
      'id', 'provider', 'providerTransactionId', 'provider_transaction_id',
      'account_id', 'transaction_id', 'payment_channel', 'merchant_name',
      'account_owner', 'statement_id',
    ])
  })

  test('preserves nested response shape and transactionFields selections', ({ assert }) => {
    const institution = new Institution().merge({
      id: 50, name: 'Bank', accessToken: 'private-token', institutionId: 'bank-id',
    })
    const account = new Account().merge({ id: 20, name: 'Checking', institutionId: 50 })
    account.$setRelated('institution', institution)
    const row = accountTransaction()
    row.$setRelated('account', account)
    const transaction = new Transaction().merge({
      id: 30, sortOrder: 2, duplicateOfTransactionId: null, budgetId: 60, deleted: false,
    })
    transaction.$setRelated('accountTransaction', row)

    const serialized = transaction.serialize(transactionFields)
    assert.deepEqual(serialized, {
      id: 30,
      sortOrder: 2,
      duplicateOfTransactionId: null,
      accountTransaction: {
        name: 'Purchase',
        amount: '12.50',
        principle: null,
        pending: false,
        paymentChannel: 'online',
        accountOwner: 'Owner',
        statementId: 40,
        location: null,
        account: { id: 20, name: 'Checking', institution: { name: 'Bank' } },
      },
    })
    assert.notAnyProperties(serialized, ['account_transaction', 'sort_order', 'budgetId', 'deleted'])
    assert.notAnyProperties(serialized.accountTransaction, [
      'id', 'provider', 'providerTransactionId', 'merchantName', 'accountId', 'transactionId',
      'payment_channel', 'account_owner', 'statement_id',
    ])
  })
})


test.group('Transaction allocation API strings', () => {
  test('all Transaction response types serialize Category amounts without changing runtime data')
    .with([0, 2, 3, 4, 5]).run(({ assert }, type) => {
      const categories = [
        { categoryId: 1, amount: 0.1 + 0.2, comment: 'keep', baseAmount: 1.005,
          fundingCategories: [{ categoryId: 2, amount: 100, percentage: true }] },
        { categoryId: 2, amount: -0.125 }, { categoryId: 3, amount: 0 },
      ]
      const row = new Transaction().merge({ id: 1, type, categories })
      const before = globalThis.structuredClone(row.$attributes)
      for (const response of [row.serialize(), row.serialize(transactionFields), JSON.parse(JSON.stringify(row))]) {
        assert.deepEqual(response.categories, [
          { ...categories[0], amount: '0.30' }, { ...categories[1], amount: '-0.12' }, { ...categories[2], amount: '0.00' },
        ])
      }
      assert.deepEqual(row.$attributes, before)
      assert.strictEqual(row.categories[0].amount, 0.1 + 0.2)
    })
  test('unsafe Category amounts cannot be serialized').with([NaN, Infinity, Number.MAX_SAFE_INTEGER])
    .run(({ assert }, amount) => {
      const row = new Transaction().merge({ categories: [{ categoryId: 1, amount }] })
      assert.throws(() => row.serialize())
    })
})


test.group('AccountTransaction amount API strings', () => {
  test('amount serialization is canonical while model amounts and other fields remain unchanged').with([
    { amount: 12.5, expected: '12.50' }, { amount: -12.5, expected: '-12.50' },
    { amount: 0, expected: '0.00' }, { amount: -0, expected: '0.00' },
    { amount: 0.1 + 0.2, expected: '0.30' }, { amount: 0.125, expected: '0.13' },
    { amount: -0.125, expected: '-0.12' }, { amount: 1.005, expected: '1.00' },
  ]).run(({ assert }, { amount, expected }) => {
    const row = accountTransaction().merge({ amount, principle: 1.25 })
    const before = globalThis.structuredClone(row.$attributes)
    const transaction = new Transaction()
    transaction.$setRelated('accountTransaction', row)
    assert.strictEqual(row.serialize().amount, expected)
    assert.strictEqual(JSON.parse(JSON.stringify(row)).amount, expected)
    assert.strictEqual(transaction.serialize(transactionFields).accountTransaction.amount, expected)
    assert.strictEqual(row.amount, amount)
    assert.strictEqual(row.serialize().principle, 1.25)
    assert.deepEqual(row.$attributes, before)
  })
  test('hydrated database amounts serialize without making the model dirty', ({ assert }) => {
    const row = AccountTransaction.$createFromAdapterResult({ id: 1, amount: '-12.34', principle: null })
    assert.isNotNull(row)
    assert.strictEqual(row?.amount, -12.34)
    assert.strictEqual(row?.serialize().amount, '-12.34')
    assert.isNull(row?.serialize().principle)
    assert.isFalse(row?.$isDirty)
  })
  test('invalid amounts cannot be emitted as valid monetary strings').with([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER])
    .run(({ assert }, amount) => assert.throws(() => accountTransaction().merge({ amount }).serialize()))
})


test.group('Transaction tax API strings', () => {
  test('serializes each tax amount without changing runtime values, metadata or ordering').with([
    { amount: 12.5, expected: '12.50' }, { amount: -12.5, expected: '-12.50' },
    { amount: 0, expected: '0.00' }, { amount: -0, expected: '0.00' },
    { amount: 0.125, expected: '0.13' }, { amount: -0.125, expected: '-0.12' },
    { amount: 1.005, expected: '1.00' }, { amount: 0.1 + 0.2, expected: '0.30' },
  ]).run(({ assert }, { amount, expected }) => {
    const taxes = [{ type: 'estimated_tax_payments', amount, metadata: { amount: 1.005 } },
      { type: 'estimated_tax_payments', amount: 0 }]
    const row = new Transaction().merge({ taxes })
    const before = globalThis.structuredClone(row.$attributes)
    for (const response of [row.serialize(), row.serialize(transactionFields), JSON.parse(JSON.stringify(row))]) {
      assert.deepEqual(response.taxes, [{ ...taxes[0], amount: expected }, { ...taxes[1], amount: '0.00' }])
    }
    assert.deepEqual(row.$attributes, before)
    assert.strictEqual(row.taxes[0].amount, amount)
  })
  test('empty and omitted tax arrays retain their existing serialization', ({ assert }) => {
    assert.deepEqual(new Transaction().merge({ taxes: [] }).serialize().taxes, [])
    assert.isNull(Transaction.$createFromAdapterResult({ taxes: null })?.serialize().taxes)
    assert.notProperty(new Transaction().serialize(), 'taxes')
  })
  test('invalid tax amounts cannot be emitted').with([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER])
    .run(({ assert }, amount) => assert.throws(() => new Transaction().merge({ taxes: [{ type: 'x', amount }] }).serialize()))
})


test.group('Account balance API strings', () => {
  test('formats balances without changing numeric models or nullable Plaid balances').with([
    { balance: 12.5, plaidBalance: 0.3, expected: '12.50', plaid: '0.30' },
    { balance: -12.34, plaidBalance: -12.34, expected: '-12.34', plaid: '-12.34' },
    { balance: 0, plaidBalance: null, expected: '0.00', plaid: null },
  ]).run(({ assert }, value) => {
    const account = new Account().merge({ id: 1, balance: value.balance, plaidBalance: value.plaidBalance, rate: 1.25 })
    const before = globalThis.structuredClone(account.$attributes)
    for (const response of [account.serialize(), JSON.parse(JSON.stringify(account))]) {
      assert.strictEqual(response.balance, value.expected)
      assert.strictEqual(response.plaidBalance, value.plaid)
      assert.strictEqual(response.rate, 1.25)
    }
    assert.deepEqual(account.$attributes, before)
    assert.strictEqual(account.balance, value.balance)
    assert.strictEqual(account.plaidBalance, value.plaidBalance)
  })
  test('database hydration retains numbers and remains clean during response serialization', ({ assert }) => {
    const account = Account.$createFromAdapterResult({ id: 1, balance: '12.50', plaid_balance: '-0.30' })
    assert.strictEqual(account?.serialize().balance, '12.50')
    assert.strictEqual(account?.serialize().plaidBalance, '-0.30')
    assert.strictEqual(account?.balance, 12.5)
    assert.strictEqual(account?.plaidBalance, -0.3)
    assert.isFalse(account?.$isDirty)
  })
})


test('connected-account responses encode balances without changing model values', async ({ assert }) => {
  const budget = new Budget()
  const account = new Account().merge({ id: 1, balance: 12.5, plaidBalance: 0.3 })
  account.$extras.pendingBalance = '0.00'
  const institution = new Institution().merge({ id: 2, name: 'Bank' })
  institution.$setRelated('accounts', [account])
  const related = mock.method(budget, 'related', () => ({
    query: () => ({ preload: async () => [institution] }),
  }))
  try {
    const result = await budget.getConnectedAccounts()
    assert.strictEqual(result[0].accounts[0].balance, '12.50')
    assert.strictEqual(result[0].accounts[0].plaidBalance, '0.30')
    assert.strictEqual(result[0].accounts[0].pendingBalance, '0.00')
    assert.strictEqual(account.balance, 12.5)
    assert.strictEqual(account.plaidBalance, 0.3)
    for (const [stored, expected] of [[null, '0.00'], ['-37.00', '-37.00'], ['12.50', '12.50']] as const) {
      account.$extras.pendingBalance = stored
      const response = await budget.getConnectedAccounts()
      assert.strictEqual(response[0].accounts[0].pendingBalance, expected)
      assert.strictEqual(account.$extras.pendingBalance, stored)
    }
  } finally {
    related.mock.restore()
  }
})


test('Category responses encode balances while runtime values remain numeric', ({ assert }) => {
  for (const [amount, expected] of [[12.5, '12.50'], [-0.3, '-0.30'], [0, '0.00']] as const) {
    const category = new Category().merge({ id: 1, balance: amount, fundingAmount: 5 })
    assert.strictEqual(category.serialize().balance, expected)
    assert.strictEqual(JSON.parse(JSON.stringify(category)).balance, expected)
    assert.strictEqual(category.balance, amount)
    assert.strictEqual(category.serialize().fundingAmount, 5)
  }
})
