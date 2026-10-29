import { test } from '@japa/runner'
import { parseMoneyCents, formatMoneyCents, addMoneyCents } from '../../../common/moneyCents.ts'
import { inputMoneyCents, encodeTransferCategories } from '../../../client-src/monetary.ts'
import { calculateFunding, computeSpread, fundingCalculationInputs, fundingCategoryEffectCents } from '../../../client-src/Funding/calculateFunding.ts'
import { legacyCalculateFunding } from '../../fixtures/funding/legacyPreview.ts'

const rule = (categoryId, amount = 100) => ({ categoryId, percentage: true, amount })
const row = (baseAmount, fundingCategories = [rule(99)], includeFundingTransfers = false) => ({ baseAmount, fundingCategories, includeFundingTransfers })
const scenarios = [
  { 10: row(0.1, [rule(99)], true), 20: row(0.2, [rule(10)]) },
  { 10: row(1, [rule(99)], true), 20: row(1, [rule(10)], true), 30: row(1, [rule(20)]) },
  { 10: row(1, [rule(20)]), 20: row(1, [rule(30)], true), 30: row(1, [rule(99)], true) },
  { 10: row(1, [rule(20)], true), 20: row(1, [rule(10)], true) },
]
for (const amount of [0, 0.01, -0.01, 0.02, -0.02, 0.05, -0.05, 1, -1, 10, -10, 100, -100]) {
  scenarios.push({ 10: row(amount, [rule(99, 33.33), rule(20, 33.33), rule(30, 33.34)]) })
  scenarios.push({ 10: row(amount, [{ categoryId: 99, amount: 2.5, percentage: false }, rule(20)]) })
  scenarios.push({ 10: row(amount, [rule(99, 50), rule(99, 50)]) })
}

test('cent engine preserves previous posted allocations, ordering, caps and residuals').with(scenarios)
  .run(({ assert }, editor) => {
    const before = globalThis.structuredClone(editor)
    const previous = legacyCalculateFunding(editor, 99)
    const rows = calculateFunding(fundingCalculationInputs(editor), 99)
    assert.deepEqual(rows.map(({ categoryId, amountCents, baseAmountCents, funder, includeFundingTransfers }) => ({
      categoryId, amountCents, baseAmountCents, funder, includeFundingTransfers,
    })), previous.map(({ categoryId, amount, baseAmount, funder, includeFundingTransfers }) => ({
      categoryId, amountCents: inputMoneyCents(amount), baseAmountCents: inputMoneyCents(baseAmount), funder, includeFundingTransfers,
    })))
    assert.strictEqual(addMoneyCents(...rows.map(row => row.amountCents)), 0)
    assert.deepEqual(editor, before)
  })

test('large cent values remain exact through allocation and request formatting', ({ assert }) => {
  const inputs = fundingCalculationInputs({ 10: row('90071992547409.91') })
  const rows = calculateFunding(inputs, 99)
  assert.strictEqual(rows[0].amountCents, Number.MAX_SAFE_INTEGER)
  assert.strictEqual(rows[1].amountCents, -Number.MAX_SAFE_INTEGER)
  assert.strictEqual(fundingCategoryEffectCents(rows, 99), -Number.MAX_SAFE_INTEGER)
  const wire = encodeTransferCategories(rows.map(({ amountCents, ...row }) => ({ ...row, amount: formatMoneyCents(amountCents) })))
  assert.strictEqual(wire[0].amount, '90071992547409.91')
  assert.strictEqual(wire[0].baseAmount, '90071992547409.91')
  assert.strictEqual(wire[1].amount, '-90071992547409.91')
  assert.notProperty(wire[0], 'baseAmountCents')
  assert.notProperty(wire[0], 'amountCents')
})

test('percentage half ties preserve Math.round and the existing last-rule correction', ({ assert }) => {
  assert.deepEqual([...computeSpread(parseMoneyCents('0.01'), [rule(1, 50), rule(2, 50)])], [[1, 1]])
  assert.deepEqual([...computeSpread(parseMoneyCents('-0.01'), [rule(1, 50), rule(2, 50)])], [[2, -1]])
})

test('cent engine rejects invalid operands, unsafe percentages and accumulated overflow', ({ assert }) => {
  for (const invalid of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => computeSpread(invalid, [rule(1)]))
    assert.throws(() => computeSpread(parseMoneyCents('1.00'), [{ categoryId: 1, percentage: false, amountCents: invalid }]))
  }
  for (const amount of [NaN, Infinity, Number.MAX_VALUE]) {
    assert.throws(() => computeSpread(parseMoneyCents('1.00'), [rule(1, amount)]))
  }
  assert.throws(() => calculateFunding(fundingCalculationInputs({
    10: row('90071992547409.91'), 20: row('0.01'),
  }), 99))
})
