import { test } from '@japa/runner'
import { isApiErrorArray, type ApiError } from '../../../common/ResponseTypes.ts'
import { toFormErrors } from '../../../client-src/apiErrors.ts'

const errors: ApiError[] = [
  { field: 'amount', message: 'Amount is required', rule: 'required', meta: { label: 'Amount' } },
  { message: 'Unable to save' },
  { code: 'INVALID_AMOUNT', status: '422', detail: 'Invalid amount',
    source: { pointer: 'amount' } },
  { code: 'INCORRECT_VERSION', status: '409', detail: 'Reload the transaction' },
]

test('API errors accept native, legacy, general and mixed collections', ({ assert }) => {
  assert.isTrue(isApiErrorArray(errors))
  assert.isTrue(isApiErrorArray([]))
  for (const error of errors) assert.isTrue(isApiErrorArray([error]))
})

test('API errors reject malformed payloads and inspect every entry').with([
  null, undefined, {}, 'error', [null], [{}], [{ message: 1 }], [{ detail: false }],
  [{ message: 'Invalid', field: 1 }], [{ message: 'Invalid', rule: false }],
  [{ detail: 'Invalid', source: null }], [{ detail: 'Invalid', source: {} }],
  [{ message: 'Invalid', code: 123 }], [errors[0], null], [errors[0], {}],
  [{ message: 'Invalid', meta: null }], [{ message: 'Invalid', meta: [] }],
  [{ message: 'Invalid', index: false }],
]).run(({ assert }, value) => {
  assert.isFalse(isApiErrorArray(value))
})

test('form errors preserve native fields and messages with legacy fallbacks', ({ assert }) => {
  const before = structuredClone(errors)
  assert.deepEqual(toFormErrors(errors), [
    { field: 'amount', message: 'Amount is required', rule: 'required' },
    { field: '', message: 'Unable to save', rule: '' },
    { field: 'amount', message: 'Invalid amount', rule: 'INVALID_AMOUNT' },
    { field: '', message: 'Reload the transaction', rule: 'INCORRECT_VERSION' },
  ])
  assert.deepEqual(toFormErrors([]), [])
  assert.deepEqual(errors, before)
})

test('native error properties take precedence during transition', ({ assert }) => {
  assert.deepEqual(toFormErrors([{ field: 'name', message: 'Required', rule: 'required',
    detail: 'Legacy message', code: 'LEGACY', source: { pointer: 'oldName' } }]), [
    { field: 'name', message: 'Required', rule: 'required' },
  ])
})
