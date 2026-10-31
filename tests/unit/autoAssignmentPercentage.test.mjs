import test from 'node:test'
import assert from 'node:assert/strict'
import { autoAssignmentPercentageCents } from '../../app/services/autoAssignmentAmount.ts'
import { parseMoneyCents, formatMoneyCents, moneyCentsFromInteger } from
  '../../common/moneyCents.ts'

for (const [base, percentage, expected] of [
  ['1.00', 14.5, '0.15'], ['-1.00', 14.5, '-0.14'],
  ['1.00', -14.5, '-0.14'], ['-1.00', -14.5, '0.15'],
  ['0.01', 50, '0.01'], ['-0.01', 50, '0.00'],
  ['0.29', 50, '0.15'], ['-0.29', 50, '-0.14'],
  ['89.99', 12.75, '11.47'], ['89.99', 87.25, '78.52'],
  ['1.00', 14.49, '0.14'], ['1.00', 14.51, '0.15'],
  ['-1.00', 14.49, '-0.14'], ['-1.00', 14.51, '-0.15'],
  ['0.00', 100, '0.00'], ['1.00', 0, '0.00'], ['1.00', -0, '0.00'],
  ['90071992547409.91', 100, '90071992547409.91'],
  ['-90071992547409.91', 100, '-90071992547409.91'],
]) {
  test(`${base} at ${percentage}% rounds exactly to ${expected}`, () => {
    const cents = autoAssignmentPercentageCents(parseMoneyCents(base), percentage)
    assert.equal(formatMoneyCents(cents), expected)
    assert.equal(Object.is(cents, -0), false)
  })
}

test('unsafe results and invalid operands reject', () => {
  const max = moneyCentsFromInteger(Number.MAX_SAFE_INTEGER)
  assert.throws(() => autoAssignmentPercentageCents(max, 100.01))
  assert.throws(() => autoAssignmentPercentageCents(-max, 100.01))
  for (const percentage of [NaN, Infinity, -Infinity, 10000000000]) {
    assert.throws(() => autoAssignmentPercentageCents(parseMoneyCents('1.00'), percentage))
  }
  for (const base of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => autoAssignmentPercentageCents(base, 50))
  }
})
