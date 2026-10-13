import { test } from '@japa/runner'
import vine from '@vinejs/vine'
import { JSONAPIErrorReporter } from '#app/validation/JSONAPIErrorReporter'
import { fundingPercentageUnits, validateFundingPercentages } from '#common/fundingPercentages'
import { fundingPercentagesRule } from '#app/validation/fundingPercentages'

const spread = () => vine.array(vine.object({
  categoryId: vine.number(), amount: vine.number(), percentage: vine.boolean(),
})).use(fundingPercentagesRule())

const schema = vine.compile(vine.object({ fundingCategories: spread() }))
const optional = vine.compile(vine.object({ fundingCategories: spread().optional() }))

test.group('Exact funding percentage validation', () => {
  test('converts canonical decimal representations without binary scaling or rounding').with([
    { input: 100, expected: 10000n }, { input: 50, expected: 5000n },
    { input: 33.33, expected: 3333n }, { input: 33.3, expected: 3330n },
    { input: 0, expected: 0n }, { input: 0.01, expected: 1n },
    { input: 0.1, expected: 10n }, { input: 0.29, expected: 29n },
    { input: '50', expected: 5000n }, { input: '33.33', expected: 3333n },
    { input: '1e2', expected: 10000n }, { input: '1e-2', expected: 1n },
    { input: 1e21, expected: 10n ** 23n },
  ]).run(({ assert }, { input, expected }) => {
    assert.equal(fundingPercentageUnits(input), expected)
  })

  test('rejects sign, finer precision, malformed and nonfinite amounts').with([
    { input: -1, rule: 'fundingPercentageNonnegative' },
    { input: 0.001, rule: 'fundingPercentagePrecision' },
    { input: 1e-7, rule: 'fundingPercentagePrecision' },
    { input: Number.MIN_VALUE, rule: 'fundingPercentagePrecision' },
    { input: 'abc', rule: 'fundingPercentageNumber' },
    { input: '', rule: 'fundingPercentageNumber' },
    { input: null, rule: 'fundingPercentageNumber' },
    { input: Infinity, rule: 'fundingPercentageNumber' },
    { input: NaN, rule: 'fundingPercentageNumber' },
  ]).run(({ assert }, { input, rule }) => {
    const result = fundingPercentageUnits(input)
    if (typeof result === 'bigint') throw new Error('Invalid percentage accepted')
    assert.equal(result.rule, rule)
  })

  test('collection validation counts duplicates, excludes fixed entries and uses exact units', ({ assert }) => {
    assert.isUndefined(validateFundingPercentages([]))
    assert.isUndefined(validateFundingPercentages([{ amount: -7, percentage: false }]))
    assert.isUndefined(validateFundingPercentages([0.29, 99.71].map((amount) => ({ amount, percentage: true }))))
    assert.equal(validateFundingPercentages([{ amount: 0, percentage: true }])?.rule, 'fundingPercentageTotal')
    assert.equal(validateFundingPercentages([{ amount: 1e21, percentage: true }])?.rule, 'fundingPercentageTotal')
  })

  test('Vine adapter accepts raw numeric/boolean strings and preserves child coercion', async ({ assert }) => {
    const output = await schema.validate({ fundingCategories: [
      { categoryId: '1', amount: '50', percentage: 'true' },
      { categoryId: '1', amount: '50', percentage: 'true' },
      { categoryId: '1', amount: '-7', percentage: 'false' },
    ] })
    assert.deepEqual(output.fundingCategories, [
      { categoryId: 1, amount: 50, percentage: true },
      { categoryId: 1, amount: 50, percentage: true },
      { categoryId: 1, amount: -7, percentage: false },
    ])
    assert.deepEqual(await optional.validate({}), {})
    assert.deepEqual(await optional.validate({ fundingCategories: null }), {})
    assert.deepEqual(await schema.validate({ fundingCategories: [] }), { fundingCategories: [] })
  })

  test('Vine errors distinguish funding rules while malformed children retain generic errors').with([
    { amount: -100, percentage: true, rule: 'fundingPercentageNonnegative', field: 'fundingCategories' },
    { amount: 0.001, percentage: true, rule: 'fundingPercentagePrecision', field: 'fundingCategories' },
    { amount: 99.99, percentage: true, rule: 'fundingPercentageTotal', field: 'fundingCategories' },
    { amount: 'abc', percentage: true, rule: 'number', field: 'fundingCategories.0.amount' },
    { amount: null, percentage: true, rule: 'required', field: 'fundingCategories.0.amount' },
    { amount: 100, percentage: 'bad', rule: 'boolean', field: 'fundingCategories.0.percentage' },
  ]).run(async ({ assert }, scenario) => {
    const [error] = await schema.tryValidate({ fundingCategories: [{ categoryId: 1, ...scenario }] }, { errorReporter: () => new JSONAPIErrorReporter() })
    assert.isNotNull(error)
    assert.deepEqual(error?.messages.map(({ code, source }: { code: string, source: { pointer: string } }) => ({ rule: code, field: source.pointer })),
      [{ rule: scenario.rule, field: scenario.field.replace('.0.', '.*.') }])
  })
})
