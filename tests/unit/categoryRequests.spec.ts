import { test } from '@japa/runner'
import vine from '@vinejs/vine'
import { addCategory, updateCategory } from '#validators/category'

// Exercise the actual production fields without invoking unrelated name uniqueness SQL.
const schemas = {
  CREATE: vine.compile(vine.object(addCategory.schema.pick(['fundingAmount', 'fundingCategories']))),
  PATCH: vine.compile(vine.object(updateCategory.schema.pick(['fundingAmount', 'fundingCategories']))),
}
for (const [operation, schema] of Object.entries(schemas)) {
  test.group(`Category ${operation} monetary requests (no database)`, () => {
    test('canonical money decodes to numbers; percentage values remain numeric', async ({ assert }) => {
      const value = await schema.validate({ fundingAmount: '-12.50', fundingCategories: [
        { categoryId: 1, amount: '-0.12', percentage: false },
        { categoryId: 2, amount: 12.75, percentage: true },
        { categoryId: 3, amount: 87.25, percentage: true },
      ] })
      assert.strictEqual(value.fundingAmount, -12.5)
      assert.deepEqual(value.fundingCategories?.map(rule => rule.amount), [-0.12, 12.75, 87.25])
    })
    test('money rejects numeric, malformed, noncanonical and unsafe values').with([
      0, -0, 1, 1.005, true, false, {}, [], '', ' ', '1', '1.2', '1.005', '01.00', '+1.00',
      '-0.00', '1e2', ' 1.00', '1.00 ', 'Infinity', '90071992547409.92',
    ]).run(async ({ assert }, amount) => {
      await assert.rejects(() => schema.validate({ fundingAmount: amount, fundingCategories: [] }))
      await assert.rejects(() => schema.validate({ fundingCategories: [{ categoryId: 1, amount, percentage: false }] }))
    })
    test('percentage strings and nonfinite values reject').with(['100', '100.00', '', NaN, Infinity, -Infinity])
      .run(async ({ assert }, amount) => {
        await assert.rejects(() => schema.validate({ fundingCategories: [{ categoryId: 1, amount, percentage: true }] }))
      })
    test('existing percentage totals and sign validation remain intact').with([[99.99], [-1, 101], [0]])
      .run(async ({ assert }, amounts) => {
        await assert.rejects(() => schema.validate({ fundingCategories: amounts.map(amount => ({ categoryId: 1, amount, percentage: true })) }))
      })
    test('zero money, empty configurations and omitted fundingAmount remain valid', async ({ assert }) => {
      assert.deepEqual(await schema.validate({ fundingAmount: '0.00', fundingCategories: [] }), { fundingAmount: 0, fundingCategories: [] })
      assert.deepEqual(await schema.validate({ fundingCategories: [] }), { fundingCategories: [] })
      if (operation === 'PATCH') {
        assert.deepEqual(await schema.validate({}), {})
        assert.deepEqual(await schema.validate({ fundingCategories: null, fundingAmount: null }), {})
      }
    })
  })
}
