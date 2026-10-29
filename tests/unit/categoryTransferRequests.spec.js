import { test } from '@japa/runner'
import { updateCategoryTransfer } from '../../app/validation/Validators/categoryTransfer.ts'
import { formatMoneyCents } from '../../common/moneyCents.ts'
import { inputMoneyCents, encodeTransferCategories } from '../../client-src/monetary.ts'

test.group('Category transfer monetary requests', () => {
  const category = amount => ({ id: 5, categoryId: 1, amount: formatMoneyCents(inputMoneyCents(
    String(amount))), baseAmountCents: inputMoneyCents(String(amount)), comment: 'keep',
    funder: true,
    includeFundingTransfers: false, fundingCategories: [{ categoryId: 2,
      amountCents: inputMoneyCents(String(amount)), percentage: false },
      { categoryId: 3, amount: 12.344, percentage: true }, { categoryId: 4, amount: 87.656,
        percentage: true }] })
  const request = categories => ({ date: '2026-01-01', type: 2, categories })
  test('encodes only money and decodes to numeric calculation inputs').with([
    [12.345, '12.35'], [-0.125, '-0.12'], [0.125, '0.13'], [1.005, '1.01'],
    [0.1 + 0.2, '0.30'], [0, '0.00'], [-0, '0.00'], [-0.005, '0.00'],
  ]).run(async ({ assert }, [amount, expected]) => {
    const input = [category(amount)], before = globalThis.structuredClone(input)
    const metadata = { ...before[0] }
    delete metadata.baseAmountCents
    const wire = encodeTransferCategories(input)
    assert.deepEqual(wire, [{ ...metadata, amount: expected, baseAmount: expected,
      fundingCategories: [{ categoryId: 2, amount: expected, percentage: false }, ...before[0]
        .fundingCategories.slice(1)] }])
    assert.deepEqual(input, before)
    const validated = await updateCategoryTransfer.validate(request(wire))
    assert.deepEqual(validated.categories, [{ ...metadata, amount: Number(expected),
      baseAmount: Number(expected),
      fundingCategories: [{ categoryId: 2, amount: Number(expected), percentage: false }, ...before[
        0].fundingCategories.slice(1)] }])
  })
  test('all monetary paths reject numeric, noncanonical and unsafe requests').with([
    1, '1.005', '1e2', '01.00', '-0.00', '', true, '90071992547409.92', Infinity,
  ]).run(async ({ assert }, amount) => {
    for (const field of ['amount', 'baseAmount', 'fixed']) {
      const rows = encodeTransferCategories([category(1)])
      if (field === 'fixed') rows[0].fundingCategories[0].amount = amount
      else rows[0][field] = amount
      await assert.rejects(() => updateCategoryTransfer.validate(request(rows)))
    }
  })
  test('percentages require numbers and existing total/nonnegative validation remains', async ({
    assert }) => {
    for (const amounts of [['12.34', 87.66], [-1, 101], [12.345, 87.655], [99.99]]) {
      const rows = [{ categoryId: 1, amount: '0.00', fundingCategories:
        amounts.map(amount => ({ categoryId: 2, amount, percentage: true })) }]
      await assert.rejects(() => updateCategoryTransfer.validate(request(rows)))
    }
  })
  test(
    'optional metadata remains absent and null optional values retain existing omission semantics',
    async ({ assert }) => {
    const wire = encodeTransferCategories([{ categoryId: 1, amount: '0.00' }])
    assert.deepEqual(wire, [{ categoryId: 1, amount: '0.00' }])
    assert.deepEqual((await updateCategoryTransfer.validate(request(wire))).categories, [{
      categoryId: 1, amount: 0 }])
    const result = await updateCategoryTransfer.validate(request([{ categoryId: 1, amount: '0.00',
      baseAmount: null }]))
    assert.notProperty(result.categories[0], 'baseAmount')
  })
  test('obsolete dollar-number transfer inputs are rejected', ({ assert }) => {
    assert.throws(() => encodeTransferCategories([{ categoryId: 1, amount: 1 }]))
    assert.throws(() => encodeTransferCategories([{ categoryId: 1, amount: '1.00',
      baseAmount: 1 }]))
    assert.throws(() => encodeTransferCategories([{ categoryId: 1, amount: '1.00',
      fundingCategories: [{ categoryId: 2, percentage: false, amount: 1 }] }]))
  })
  test('unsafe client money rejects before persistence').with([NaN, Infinity, Number
    .MAX_SAFE_INTEGER + 1])
    .run(({ assert }, amount) => {
      for (const field of ['amount', 'baseAmount', 'fixed']) {
        const row = category(1)
        if (field === 'fixed') row.fundingCategories[0].amountCents = amount
        else row[field === 'baseAmount' ? 'baseAmountCents' : field] = amount
        assert.throws(() => encodeTransferCategories([row]))
      }
    })
})
