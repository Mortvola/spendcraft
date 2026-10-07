import { test } from '@japa/runner'
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
      amount: 12.5,
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
        amount: 12.5,
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
