import { test } from '@japa/runner'
import { addAutoAssignment, updateAutoAssignment } from '#validators/autoAssignment'

for (const [operation, validator] of [['CREATE', addAutoAssignment], ['PATCH',
  updateAutoAssignment]] as const) {
  const payload = (amount: unknown, percentage: boolean) => ({ name: 'Rule', searchStrings: [
    'Shop'],
    categories: [{ id: -1, categoryId: 1, amount, percentage }] })
  test.group(`Auto-assignment ${operation} request amounts (no database)`, () => {
    test('canonical fixed dollars become numeric model inputs').with(['0.00', '-0.12', '12.75',
      '9999999999.99', '-9999999999.99'])
      .run(async ({ assert }, amount) => {
        const result = await validator.validate(payload(amount, false))
        assert.strictEqual(result.categories[0].amount, Number(amount))
        assert.isFalse(result.categories[0].percentage)
        assert.strictEqual(result.categories[0].id, -1)
      })
    test('fixed dollars reject numeric, malformed, unsafe and out-of-range inputs').with([
      0, -0, 12.75, true, null, {}, [], '', '1', '1.2', '1.005', '1e2', '+1.00', '01.00',
      '-0.00', ' 1.00', 'Infinity', '10000000000.00', '-10000000000.00', '90071992547409.92',
    ]).run(async ({ assert }, amount) => { await assert.rejects(() => validator.validate(payload(
      amount, false))) })
    test('percentages remain numeric with existing precision').with([0, -0.125, 12.345, 100,
      9999999999.99])
      .run(async ({ assert }, amount) => {
        const result = await validator.validate(payload(amount, true))
        assert.strictEqual(result.categories[0].amount, amount)
        assert.isTrue(result.categories[0].percentage)
      })
    test('percentage strings, nonfinite and out-of-range inputs reject').with(['100', '12.75', NaN,
      Infinity, -Infinity, 10000000000, -10000000000])
      .run(async ({ assert }, amount) => { await assert.rejects(() => validator.validate(payload(
        amount, true))) })
    test('mixed modes and switching preserve identities and numeric values', async ({ assert }) => {
      const result = await validator.validate({ name: 'Mixed', searchStrings: [], categories: [
        { id: 1, categoryId: 2, amount: '-0.12', percentage: false },
        { id: 2, categoryId: 3, amount: 12.75, percentage: true },
      ] })
      assert.deepEqual(result.categories, [{ id: 1, categoryId: 2, amount: -0.12,
        percentage: false },
        { id: 2, categoryId: 3, amount: 12.75, percentage: true }])
      await assert.rejects(() => validator.validate({ ...payload('0.00', false), categories: [{
        id: 1, categoryId: 1, amount: '0.00', percentage: null }] }))
    })
  })
}
