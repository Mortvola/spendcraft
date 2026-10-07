import { test } from '@japa/runner'
import {
  AccountType, TrackingType,
  isUpdateCategoryTransferResponse, isDeleteTransactionResponse,
  isInsertCategoryTransferResponse, isDeleteInstitutionResponse, isDeleteAccountResponse,
  isAddOnlineAccountsResponse, isInstitutionsResponse, isBalancesResponse,
  isCategoryTreeBalanceResponse,
} from '#common/ResponseTypes'

const categoryBalance = { id: 1, balance: 12.5 }
const account = {
  id: 2, plaidId: null, name: 'Checking', closed: false,
  type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Balances,
  balance: 12.5, pendingBalance: 0, plaidBalance: null, startDate: null, rate: null,
}
const institution = {
  id: 3, plaidInstitutionId: null, name: 'Bank', syncDate: null, accounts: [account],
}
const balance = { id: 4, balance: 12.5, date: '2026-10-07' }

const categoryGuards: {
  name: string,
  guard: (value: unknown) => boolean,
  response: (rows: unknown[]) => unknown,
}[] = [
  {
    name: 'isUpdateCategoryTransferResponse', guard: isUpdateCategoryTransferResponse,
    response: (balances) => ({ balances, transaction: { categories: [] } }),
  },
  {
    name: 'isDeleteTransactionResponse', guard: isDeleteTransactionResponse,
    response: (categories) => ({ categories, acctBalances: [] }),
  },
  {
    name: 'isInsertCategoryTransferResponse', guard: isInsertCategoryTransferResponse,
    response: (balances) => ({ balances, transaction: { id: 5 } }),
  },
  { name: 'isDeleteInstitutionResponse', guard: isDeleteInstitutionResponse, response: (rows) => rows },
  { name: 'isDeleteAccountResponse', guard: isDeleteAccountResponse, response: (rows) => rows },
]

for (const { name, guard, response } of categoryGuards) {
  test.group(`Response guards / ${name}`, () => {
    test('accepts empty and nonempty collections', ({ assert }) => {
      assert.isTrue(guard(response([])))
      assert.isTrue(guard(response([categoryBalance])))
    })
    test('rejects a first row missing id or balance', ({ assert }) => {
      assert.isFalse(guard(response([{ balance: 12.5 }])))
      assert.isFalse(guard(response([{ id: 1 }])))
    })
    test('checks only the first row', ({ assert }) => {
      assert.isTrue(guard(response([categoryBalance, null])))
    })
    test('throws for a null first row', ({ assert }) => {
      assert.throws(() => guard(response([null])), TypeError)
    })
    test('preserves top-level null behavior', ({ assert }) => {
      if (name === 'isDeleteInstitutionResponse' || name === 'isDeleteAccountResponse') {
        assert.isFalse(guard(null))
      } else {
        assert.throws(() => guard(null), TypeError)
      }
    })
  })
}

test.group('Response guards / isAddOnlineAccountsResponse', () => {
  test('accepts empty and nonempty accounts', ({ assert }) => {
    assert.isTrue(isAddOnlineAccountsResponse({ accounts: [], categories: [] }))
    assert.isTrue(isAddOnlineAccountsResponse({ accounts: [account], categories: [] }))
  })
  test('rejects an account missing tracking', ({ assert }) => {
    const { tracking, ...withoutTracking } = account
    assert.equal(tracking, TrackingType.Balances)
    assert.isFalse(isAddOnlineAccountsResponse({ accounts: [withoutTracking], categories: [] }))
  })
  test('checks only the first account', ({ assert }) => {
    assert.isTrue(isAddOnlineAccountsResponse({ accounts: [account, null] }))
  })
  test('throws for null input, collection, or first account', ({ assert }) => {
    for (const value of [null, { accounts: null }, { accounts: [null] }]) {
      assert.throws(() => isAddOnlineAccountsResponse(value), TypeError)
    }
  })
  test('rejects missing accounts but accepts an empty non-array collection', ({ assert }) => {
    assert.isFalse(isAddOnlineAccountsResponse({}))
    assert.isTrue(isAddOnlineAccountsResponse({ accounts: { length: 0 } }))
  })
})

test.group('Response guards / isInstitutionsResponse', () => {
  test('accepts empty and nonempty institutions', ({ assert }) => {
    assert.isTrue(isInstitutionsResponse([]))
    assert.isTrue(isInstitutionsResponse([institution]))
  })
  test('rejects a first institution missing accounts', ({ assert }) => {
    assert.isFalse(isInstitutionsResponse([{ id: 3, name: 'Bank' }]))
  })
  test('checks only the first institution and does not validate its accounts', ({ assert }) => {
    assert.isTrue(isInstitutionsResponse([institution, null]))
    assert.isTrue(isInstitutionsResponse([{ ...institution, accounts: null }]))
  })
  test('rejects top-level null but throws for a null first institution', ({ assert }) => {
    assert.isFalse(isInstitutionsResponse(null))
    assert.throws(() => isInstitutionsResponse([null]), TypeError)
  })
})

test.group('Response guards / isBalancesResponse', () => {
  test('accepts empty and nonempty balances', ({ assert }) => {
    assert.isTrue(isBalancesResponse([]))
    assert.isTrue(isBalancesResponse([balance]))
  })
  test('rejects a first balance missing balance', ({ assert }) => {
    assert.isFalse(isBalancesResponse([{ id: 4, date: '2026-10-07' }]))
  })
  test('checks only the first balance', ({ assert }) => {
    assert.isTrue(isBalancesResponse([balance, null]))
  })
  test('throws for top-level null or a null first balance', ({ assert }) => {
    assert.throws(() => isBalancesResponse(null), TypeError)
    assert.throws(() => isBalancesResponse([null]), TypeError)
  })
  test('accepts an empty non-array collection', ({ assert }) => {
    assert.isTrue(isBalancesResponse({ length: 0 }))
  })
})

test.group('Response guards / isCategoryTreeBalanceResponse', () => {
  test('accepts a nonempty collection', ({ assert }) => {
    assert.isTrue(isCategoryTreeBalanceResponse([categoryBalance]))
  })
  test('rejects a first row missing id or balance', ({ assert }) => {
    assert.isFalse(isCategoryTreeBalanceResponse([{ balance: 12.5 }]))
    assert.isFalse(isCategoryTreeBalanceResponse([{ id: 1 }]))
  })
  test('checks only the first row', ({ assert }) => {
    assert.isTrue(isCategoryTreeBalanceResponse([categoryBalance, null]))
  })
  test('throws for empty collections or a null first row', ({ assert }) => {
    assert.throws(() => isCategoryTreeBalanceResponse([]), TypeError)
    assert.throws(() => isCategoryTreeBalanceResponse([null]), TypeError)
  })
  test('rejects top-level null and non-arrays', ({ assert }) => {
    assert.isFalse(isCategoryTreeBalanceResponse(null))
    assert.isFalse(isCategoryTreeBalanceResponse({ length: 0 }))
  })
})
