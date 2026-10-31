import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { addMoneyCents, parseMoneyCents } from '#common/moneyCents'
import AutoAssignmentCategory from '#models/AutoAssignmentCategory'
import AutoAssignment from '#models/AutoAssignment'
import Category from '#models/Category'
import { test } from '@japa/runner'
import { mock } from 'node:test'
import Budget from '#models/Budget'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Account from '#models/Account'
import Institution from '#models/Institution'
import transactionFields, { getAccountTransactionChanges } from '#controllers/transactionFields'

function accountTransaction() {
  return new AccountTransaction().merge({
    id: 10,
    accountId: 20,
    transactionId: 30,
    provider: 'PLAID',
    providerTransactionId: 'private-provider-id',
    name: 'Purchase',
    amountCents: parseMoneyCents('12.50'),
    principalCents: null,
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
    assert.notAnyProperties(serialized, ['account_transaction', 'sort_order', 'budgetId',
      'deleted'])
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
      for (const response of [row.serialize(), row.serialize(transactionFields), JSON.parse(JSON
        .stringify(row))]) {
        assert.deepEqual(response.categories, [
          { ...categories[0], amount: '0.30', baseAmount: '1.00' }, { ...categories[1], amount:
            '-0.12' }, { ...categories[2], amount: '0.00' },
        ])
      }
      assert.deepEqual(row.$attributes, before)
      assert.strictEqual(row.categories[0].amount, 0.1 + 0.2)
    })
  test('unsafe Category amounts cannot be serialized').with([NaN, Infinity, Number
    .MAX_SAFE_INTEGER])
    .run(({ assert }, amount) => {
      const row = new Transaction().merge({ categories: [{ categoryId: 1, amount }] })
      assert.throws(() => row.serialize())
    })
})


test.group('AccountTransaction amount API strings', () => {
  test('amount serialization is canonical while model cents and other fields remain unchanged')
    .with([
    { amount: 12.5, expected: '12.50' }, { amount: -12.5, expected: '-12.50' },
    { amount: 0, expected: '0.00' }, { amount: -0, expected: '0.00' },
    { amount: 0.1 + 0.2, expected: '0.30' }, { amount: 0.125, expected: '0.13' },
    { amount: -0.125, expected: '-0.12' }, { amount: 1.005, expected: '1.00' },
  ]).run(({ assert }, { amount, expected }) => {
    const row = accountTransaction().merge({ amountCents: parseMoneyCents(encodeMonetaryAmount(
      amount)), principalCents: parseMoneyCents('1.25') })
    const before = globalThis.structuredClone(row.$attributes)
    const transaction = new Transaction()
    transaction.$setRelated('accountTransaction', row)
    assert.strictEqual(row.serialize().amount, expected)
    assert.strictEqual(JSON.parse(JSON.stringify(row)).amount, expected)
    assert.strictEqual(transaction.serialize(transactionFields).accountTransaction.amount, expected)
    assert.strictEqual(row.amountCents, parseMoneyCents(encodeMonetaryAmount(amount)))
    assert.strictEqual(row.serialize().principle, '1.25')
    assert.deepEqual(row.$attributes, before)
  })
  test('hydrated database amounts serialize without making the model dirty', ({ assert }) => {
    const row = AccountTransaction.$createFromAdapterResult({ id: 1, amount: '-12.34',
      principle: null })
    assert.isNotNull(row)
    assert.strictEqual(row?.amountCents, parseMoneyCents('-12.34'))
    assert.strictEqual(row?.serialize().amount, '-12.34')
    assert.isNull(row?.serialize().principle)
    assert.isFalse(row?.$isDirty)
  })
  test('invalid amounts cannot be emitted as valid monetary strings').with([NaN, Infinity, -
    Infinity, Number.MAX_SAFE_INTEGER])
    .run(({ assert }, amount) => assert.throws(() => accountTransaction().merge(
      { amountCents: parseMoneyCents(encodeMonetaryAmount(amount)) })
      .serialize()))
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
    for (const response of [row.serialize(), row.serialize(transactionFields), JSON.parse(JSON
      .stringify(row))]) {
      assert.deepEqual(response.taxes, [{ ...taxes[0], amount: expected }, { ...taxes[1], amount:
        '0.00' }])
    }
    assert.deepEqual(row.$attributes, before)
    assert.strictEqual(row.taxes[0].amount, amount)
  })
  test('empty and omitted tax arrays retain their existing serialization', ({ assert }) => {
    assert.deepEqual(new Transaction().merge({ taxes: [] }).serialize().taxes, [])
    assert.isNull(Transaction.$createFromAdapterResult({ taxes: null })?.serialize().taxes)
    assert.notProperty(new Transaction().serialize(), 'taxes')
  })
  test('invalid tax amounts cannot be emitted').with([NaN, Infinity, -Infinity, Number
    .MAX_SAFE_INTEGER])
    .run(({ assert }, amount) => assert.throws(() => new Transaction().merge({ taxes: [{ type: 'x',
      amount }] }).serialize()))
})


test.group('Account balance API strings', () => {
  test('retains exact cents through arithmetic, persistence and API serialization', (
    { assert }) => {
    const account = Account.$createFromAdapterResult({ id: 1, balance: '0.10' })
    if (!account) throw new Error('Account hydration failed')
    account.balanceCents = addMoneyCents(account.balanceCents, parseMoneyCents('0.20'))
    assert.strictEqual(account.balanceCents, 30)
    const column = Account.$getColumn('balanceCents')
    if (!column?.prepare) throw new Error('Missing balance prepare codec')
    assert.strictEqual(column.columnName, 'balance')
    assert.strictEqual(column.prepare(account.balanceCents, 'balanceCents', account), '0.30')
    assert.strictEqual(account.serialize().balance, '0.30')
    assert.notProperty(account.serialize(), 'balanceCents')
    assert.notProperty(account.$attributes, 'balance')
  })
  test('hydrates signed and null balances directly into cents').with([
    { stored: '-0.12', expected: -12 }, { stored: '0.00', expected: 0 },
    { stored: null, expected: 0 }, { stored: '9999999999.99', expected: 999999999999 },
  ]).run(({ assert }, { stored, expected }) => {
    const account = Account.$createFromAdapterResult({ id: 1, balance: stored })
    assert.strictEqual(account?.balanceCents, expected)
    assert.isFalse(account?.$isDirty)
  })
  test('rejects malformed and unsafe database balances').with([
    '1.005', 'NaN', 'Infinity', '-0.00', '90071992547409.92', 12.5,
  ]).run(({ assert }, balance) => {
    assert.throws(() => Account.$createFromAdapterResult({ id: 1, balance }))
  })
  test('rejects invalid runtime cents before persistence or serialization', ({ assert }) => {
    const account = new Account()
    const column = Account.$getColumn('balanceCents')
    if (!column?.prepare || !column.serialize) throw new Error('Missing balance codecs')
    for (const invalid of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => column.prepare?.(invalid, 'balanceCents', account))
      assert.throws(() => column.serialize?.(invalid, 'balanceCents', account))
    }
  })

  test('nullable Plaid cents preserve storage and API names and reject invalid values', ({
    assert }) => {
    const account = new Account()
    const column = Account.$getColumn('plaidBalanceCents')
    if (!column?.prepare || !column.serialize) throw new Error('Missing Plaid balance codecs')
    assert.strictEqual(column.columnName, 'plaid_balance')
    assert.strictEqual(column.prepare(parseMoneyCents('0.30'), 'plaidBalanceCents', account),
      '0.30')
    for (const absent of [null, undefined]) {
      assert.strictEqual(column.prepare(absent, 'plaidBalanceCents', account), absent)
      assert.strictEqual(column.serialize(absent, 'plaidBalanceCents', account), absent)
    }
    for (const invalid of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => column.prepare?.(invalid, 'plaidBalanceCents', account))
      assert.throws(() => column.serialize?.(invalid, 'plaidBalanceCents', account))
    }
    for (const invalid of ['1.005', 'NaN', '-0.00', '90071992547409.92', 12.5]) {
      assert.throws(() => Account.$createFromAdapterResult({ id: 1, plaid_balance: invalid }))
    }
    account.plaidBalanceCents = parseMoneyCents('0.30')
    assert.notProperty(account.serialize(), 'plaidBalanceCents')
    assert.notProperty(account.$attributes, 'plaidBalance')
  })

  test('formats cent balances without changing models or nullable Plaid balances').with([
    { balance: 12.5, plaidBalance: 0.3, expected: '12.50', plaid: '0.30' },
    { balance: -12.34, plaidBalance: -12.34, expected: '-12.34', plaid: '-12.34' },
    { balance: 0, plaidBalance: null, expected: '0.00', plaid: null },
  ]).run(({ assert }, value) => {
    const account = new Account().merge({ id: 1, balanceCents: parseMoneyCents(
      encodeMonetaryAmount(value.balance)),
      plaidBalanceCents: value.plaid === null ? null : parseMoneyCents(value.plaid), rate: 1.25 })
    const before = globalThis.structuredClone(account.$attributes)
    for (const response of [account.serialize(), JSON.parse(JSON.stringify(account))]) {
      assert.strictEqual(response.balance, value.expected)
      assert.strictEqual(response.plaidBalance, value.plaid)
      assert.strictEqual(response.rate, 1.25)
    }
    assert.deepEqual(account.$attributes, before)
    assert.strictEqual(account.balanceCents, parseMoneyCents(encodeMonetaryAmount(value.balance)))
    assert.strictEqual(account.plaidBalanceCents, value.plaid === null
      ? null : parseMoneyCents(value.plaid))
  })
  test('database hydration retains cents and remains clean during response serialization', ({
    assert }) => {
    const account = Account.$createFromAdapterResult({ id: 1, balance: '12.50', plaid_balance:
      '-0.30' })
    assert.strictEqual(account?.serialize().balance, '12.50')
    assert.strictEqual(account?.serialize().plaidBalance, '-0.30')
    assert.strictEqual(account?.balanceCents, parseMoneyCents('12.50'))
    assert.strictEqual(account?.plaidBalanceCents, parseMoneyCents('-0.30'))
    assert.isFalse(account?.$isDirty)
  })
})


test('connected-account responses encode balances without changing model values', async ({
  assert }) => {
  const budget = new Budget()
  const account = new Account().merge({ id: 1, balanceCents: parseMoneyCents('12.50'),
    plaidBalanceCents: parseMoneyCents('0.30') })
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
    assert.strictEqual(account?.balanceCents, parseMoneyCents('12.50'))
    assert.strictEqual(account.plaidBalanceCents, parseMoneyCents('0.30'))
    for (const [stored, expected] of [[null, '0.00'], ['-37.00', '-37.00'], ['12.50',
      '12.50']] as const) {
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
    const category = new Category().merge({ id: 1, balanceCents: parseMoneyCents(
      encodeMonetaryAmount(amount)), fundingAmountCents: parseMoneyCents('5.00') })
    assert.strictEqual(category.serialize().balance, expected)
    assert.strictEqual(JSON.parse(JSON.stringify(category)).balance, expected)
    assert.strictEqual(category.balanceCents, parseMoneyCents(encodeMonetaryAmount(amount)))
    assert.strictEqual(category.serialize().fundingAmount, '5.00')
  }
})


test('funding API serialization preserves percentages, nulls, metadata and numeric models', ({
  assert }) => {
  const rules = [{ categoryId: 1, amount: -0.125, percentage: false, note: 'keep' },
    { categoryId: 2, amount: 12.75, percentage: true },
    { categoryId: 3, amount: null, percentage: false }, { categoryId: 4, percentage: false }]
  const category = new Category().merge({ fundingAmountCents: parseMoneyCents('1.00') })
  category.$setAttribute('fundingCategories', rules)
  const original = globalThis.structuredClone(category.$attributes)
  const expected = [{ ...rules[0], amount: '-0.12' }, ...rules.slice(1)]
  assert.deepEqual(category.serialize().fundingCategories, expected)
  assert.strictEqual(category.serialize().fundingAmount, '1.00')
  assert.deepEqual(category.$attributes, original)
  const categories = [
    { categoryId: 1, amount: 0, baseAmount: 0.1 + 0.2, fundingCategories: rules, extra: 'keep' },
    { categoryId: 2, amount: 0, baseAmount: null, fundingCategories: null },
    { categoryId: 3, amount: 0 },
  ]
  const transaction = new Transaction().merge({ categories })
  const before = globalThis.structuredClone(transaction.$attributes)
  const response = transaction.serialize(transactionFields).categories
  assert.deepEqual(response[0], { ...before.categories[0], amount: '0.00', baseAmount: '0.30',
    fundingCategories: expected })
  assert.deepEqual(response[1], { categoryId: 2, amount: '0.00', baseAmount: null,
    fundingCategories: null })
  assert.notProperty(response[2], 'baseAmount')
  assert.deepEqual(transaction.$attributes, before)
})


test('auto-assignment responses encode fixed dollars and preserve numeric model amounts', ({
  assert }) => {
  for (const [amount, expected] of [[12.5, '12.50'], [-0.125, '-0.12'], [0.125, '0.13'],
    [1.005, '1.00'], [0.1 + 0.2, '0.30'], [-0, '0.00']] as const) {
    for (const percentage of [false, null, true]) {
      const rule = AutoAssignmentCategory.$createFromAdapterResult({ id: 1, category_id: 20,
        amount: String(amount), percentage })
      if (!rule) throw new Error('Expected hydrated rule')
      const before = globalThis.structuredClone(rule.$attributes)
      assert.strictEqual(rule.amount, amount === 0 ? 0 : amount)
      assert.strictEqual(rule.serialize().amount, percentage === true ? (
        amount === 0 ? 0 : amount) : expected)
      assert.strictEqual(rule.serialize().percentage, percentage)
      const assignment = new AutoAssignment().merge({ id: 2 })
      assignment.$setRelated('categories', [rule])
      assert.strictEqual(JSON.parse(JSON.stringify(assignment)).categories[0].amount,
        percentage === true ? (amount === 0 ? 0 : amount) : expected)
      assert.deepEqual(rule.$attributes, before)
      assert.isFalse(rule.$isDirty)
    }
  }
})


test('AccountTransaction principal serialization preserves cents and nulls', ({
  assert }) => {
  for (const [principle, expected] of [[12.5, '12.50'], [0, '0.00'], [-0.125, '-0.12'],
    [0.125, '0.13'], [1.005, '1.00'], [0.1 + 0.2, '0.30'], [null, null]] as const) {
    const principalCents = principle === null ? null
      : parseMoneyCents(encodeMonetaryAmount(principle))
    const row = accountTransaction().merge({ principalCents })
    const before = globalThis.structuredClone(row.$attributes)
    assert.strictEqual(row.serialize().principle, expected)
    assert.strictEqual(JSON.parse(JSON.stringify(row)).principle, expected)
    assert.strictEqual(row.principalCents, principalCents)
    assert.deepEqual(row.$attributes, before)
  }
})




test.group('Category balance cents and API compatibility', () => {
  test('hydrates cents, adds exactly and preserves the database/API balance field', (
    { assert }) => {
    const category = Category.$createFromAdapterResult({ id: 1, balance: '0.10',
      funding_amount: '12.75' })
    if (!category) throw new Error('Category hydration failed')
    assert.isFalse(category.$isDirty)
    category.balanceCents = addMoneyCents(category.balanceCents, parseMoneyCents('0.20'))
    assert.strictEqual(category.balanceCents, 30)
    const column = Category.$getColumn('balanceCents')
    if (!column?.prepare) throw new Error('Missing balance codec')
    assert.strictEqual(column.columnName, 'balance')
    assert.strictEqual(column.prepare(category.balanceCents, 'balanceCents', category), '0.30')
    assert.strictEqual(category.serialize().balance, '0.30')
    assert.notProperty(category.serialize(), 'balanceCents')
    assert.notProperty(category.$attributes, 'balance')
    assert.strictEqual(category.fundingAmountCents, parseMoneyCents('12.75'))
    assert.strictEqual(category.serialize().fundingAmount, '12.75')
  })
  test('hydrates signed and zero balances without a dollar-number intermediate').with([
    { stored: '-0.12', expected: -12 }, { stored: '0.00', expected: 0 },
    { stored: '9999999999.99', expected: 999999999999 },
  ]).run(({ assert }, { stored, expected }) => {
    const category = Category.$createFromAdapterResult({ id: 1, balance: stored })
    assert.strictEqual(category?.balanceCents, expected)
    assert.strictEqual(category?.serialize().balance, stored)
    assert.isFalse(category?.$isDirty)
  })
  test('rejects malformed or unsafe stored balances').with([
    '1.005', '-0.00', 'NaN', 'Infinity', '90071992547409.92', 12.5, null,
  ]).run(({ assert }, balance) => {
    assert.throws(() => Category.$createFromAdapterResult({ id: 1, balance }))
  })
  test('rejects invalid runtime cents at persistence and serialization boundaries', (
    { assert }) => {
    const category = new Category()
    const column = Category.$getColumn('balanceCents')
    if (!column?.prepare || !column.serialize) throw new Error('Missing balance codecs')
    for (const value of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => column.prepare?.(value, 'balanceCents', category))
      assert.throws(() => column.serialize?.(value, 'balanceCents', category))
    }
  })
})


test.group('AccountTransaction cent model boundaries', () => {
  test('retains cents through arithmetic and preserves amount/principle column and API names', ({
    assert }) => {
    const row = AccountTransaction.$createFromAdapterResult({ id: 1, amount: '0.10',
      principle: '-0.12' })
    if (!row) throw new Error('AccountTransaction hydration failed')
    assert.isFalse(row.$isDirty)
    row.amountCents = addMoneyCents(row.amountCents, parseMoneyCents('0.20'))
    assert.strictEqual(row.amountCents, 30)
    assert.strictEqual(row.principalCents, -12)
    assert.strictEqual(row.serialize().amount, '0.30')
    assert.strictEqual(row.serialize().principle, '-0.12')
    assert.notProperty(row.serialize(), 'amountCents')
    assert.notProperty(row.serialize(), 'principalCents')
    assert.notProperty(row.$attributes, 'amount')
    assert.notProperty(row.$attributes, 'principle')
    for (const [name, stored, value] of [
      ['amountCents', 'amount', '0.30'], ['principalCents', 'principle', '-0.12'],
    ] as const) {
      const column = AccountTransaction.$getColumn(name)
      if (!column?.prepare) throw new Error('Missing monetary codec')
      assert.strictEqual(column.columnName, stored)
      assert.strictEqual(column.prepare(row[name], name, row), value)
    }
  })
  test('omitted principal remains omitted rather than being formatted as cents', ({ assert }) => {
    const row = accountTransaction().merge({ principalCents: undefined })
    const column = AccountTransaction.$getColumn('principalCents')
    if (!column?.prepare) throw new Error('Missing principal codec')
    assert.isUndefined(column.prepare(undefined, 'principalCents', row))
    assert.isUndefined(row.serialize().principle)
    assert.notProperty(JSON.parse(JSON.stringify(row)), 'principle')
  })
  test('nullable principal remains distinct from zero').with([null, '0.00', '-0.01', '0.01'])
    .run(({ assert }, principle) => {
      const row = AccountTransaction.$createFromAdapterResult({ id: 1, amount: '-0.30', principle })
      if (!row) throw new Error('AccountTransaction hydration failed')
      assert.strictEqual(row.amountCents, -30)
      assert.strictEqual(row.principalCents, principle === null ? null : parseMoneyCents(principle))
      assert.strictEqual(row.serialize().principle, principle)
      assert.isFalse(row.$isDirty)
    })
  test('invalid and unsafe stored money rejects').with([
    '0.001', '-0.00', 'NaN', 'Infinity', '90071992547409.92', 0.1,
  ]).run(({ assert }, value) => {
    assert.throws(() => AccountTransaction.$createFromAdapterResult({ amount: value }))
    assert.throws(() => AccountTransaction.$createFromAdapterResult({ amount: '0.00',
      principle: value }))
  })
  test('invalid runtime cents reject before persistence and serialization', ({ assert }) => {
    const row = new AccountTransaction()
    for (const name of ['amountCents', 'principalCents']) {
      const column = AccountTransaction.$getColumn(name)
      if (!column?.prepare || !column.serialize) throw new Error('Missing monetary codecs')
      for (const value of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => column.prepare?.(value, name, row))
        assert.throws(() => column.serialize?.(value, name, row))
      }
    }
  })
  test('change logs preserve public monetary names and dollar units', ({ assert }) => {
    const original = { amountCents: parseMoneyCents('12.34'), principalCents: null }
    const changes = getAccountTransactionChanges(original, {
      amountCents: parseMoneyCents('-0.12'), principalCents: parseMoneyCents('0.00'),
    }, {})
    assert.deepEqual(changes, {
      amount: { old: '12.34', new: '-0.12' }, principle: { old: null, new: '0.00' },
    })
    assert.deepEqual(getAccountTransactionChanges({ principalCents: parseMoneyCents('0.00') },
      { principalCents: null }, {}), { principle: { old: '0.00', new: null } })
    assert.deepEqual(getAccountTransactionChanges(original, { ...original }, {}), {})
    assert.deepEqual(getAccountTransactionChanges(original, { name: 'Renamed' }, {}), {
      name: { old: undefined, new: 'Renamed' },
    })
  })
})


test.group('Category funding target cent boundaries', () => {
  test('hydrates and calculates in cents while preserving the storage and API field', (
    { assert }) => {
    const row = Category.$createFromAdapterResult({ id: 1, balance: '1.00',
       funding_amount: '0.10' })
    if (!row) throw new Error('Category hydration failed')
    assert.isFalse(row.$isDirty)
    row.fundingAmountCents = addMoneyCents(row.fundingAmountCents, parseMoneyCents('0.20'))
    assert.strictEqual(row.fundingAmountCents, 30)
    assert.strictEqual(row.balanceCents, 100)
    const column = Category.$getColumn('fundingAmountCents')
    if (!column?.prepare) throw new Error('Missing funding target codec')
    assert.strictEqual(column.columnName, 'funding_amount')
    assert.strictEqual(column.prepare(row.fundingAmountCents, 'fundingAmountCents', row), '0.30')
    assert.strictEqual(row.serialize().fundingAmount, '0.30')
    assert.notProperty(row.serialize(), 'fundingAmountCents')
    assert.notProperty(row.$attributes, 'fundingAmount')
  })
  test('signed and zero targets serialize without making clean models dirty').with([
    { stored: '0.00', expected: 0 }, { stored: '-0.12', expected: -12 },
    { stored: '9999999999.99', expected: 999999999999 },
  ]).run(({ assert }, { stored, expected }) => {
    const row = Category.$createFromAdapterResult({ id: 1, funding_amount: stored })
    if (!row) throw new Error('Category hydration failed')
    assert.strictEqual(row.fundingAmountCents, expected)
    assert.strictEqual(row.serialize().fundingAmount, stored)
    assert.isFalse(row.$isDirty)
    row.name = 'Metadata only'
    assert.notProperty(row.$dirty, 'fundingAmountCents')
  })
  test('invalid and unsafe stored targets reject').with([
    '1.005', '-0.00', 'NaN', 'Infinity', '90071992547409.92', 0.1, null,
  ]).run(({ assert }, funding_amount) => {
    assert.throws(() => Category.$createFromAdapterResult({ id: 1, funding_amount }))
  })
  test('invalid runtime cents reject before persistence or serialization', ({ assert }) => {
    const row = new Category()
    const column = Category.$getColumn('fundingAmountCents')
    if (!column?.prepare || !column.serialize) throw new Error('Missing funding target codecs')
    for (const value of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => column.prepare?.(value, 'fundingAmountCents', row))
      assert.throws(() => column.serialize?.(value, 'fundingAmountCents', row))
    }
  })
})
