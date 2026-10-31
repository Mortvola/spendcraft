import { test } from '@japa/runner'
import { moneyCentsFromInteger, parseMoneyCents, addMoneyCents, subtractMoneyCents,
  formatMoneyCents, divideMoneyCents } from '../../common/moneyCents.ts'

test.group('Checked integer monetary cents', () => {
  test('canonical strings parse and format exactly').with([
    ['0.00', 0], ['0.01', 1], ['-0.01', -1], ['0.10', 10], ['1234.56', 123456],
    ['-1234.56', -123456], ['90071992547409.91', Number.MAX_SAFE_INTEGER],
    ['-90071992547409.91', -Number.MAX_SAFE_INTEGER],
  ]).run(({ assert }, [value, expected]) => {
    const cents = parseMoneyCents(value)
    assert.strictEqual(cents, expected)
    assert.strictEqual(formatMoneyCents(cents), value)
  })
  test('addition and subtraction are exact with negative and zero results', ({ assert }) => {
    const sum = addMoneyCents(parseMoneyCents('0.10'), parseMoneyCents('0.20'))
    assert.strictEqual(sum, 30)
    assert.strictEqual(formatMoneyCents(sum), '0.30')
    assert.strictEqual(subtractMoneyCents(sum, parseMoneyCents('0.30')), 0)
    assert.strictEqual(formatMoneyCents(subtractMoneyCents(parseMoneyCents('0.00'), sum)), '-0.30')
    assert.strictEqual(formatMoneyCents(addMoneyCents(parseMoneyCents('-0.10'), parseMoneyCents(
      '0.20'))), '0.10')
  })
  test('noncanonical and unsafe inputs are rejected').with([
    0, 1, undefined, null, true, {}, [], '', ' ', '1', '.10', '1.2', '1.005', '+1.00', '01.00',
    '-0.00', '1e2', 'NaN', 'Infinity', ' 1.00 ', '90071992547409.92', '-90071992547409.92',
  ]).run(({ assert }, value) => assert.throws(() => parseMoneyCents(value)))
  test('unsafe arithmetic results reject instead of losing cents', ({ assert }) => {
    const max = parseMoneyCents('90071992547409.91'), min = parseMoneyCents('-90071992547409.91'),
      one = parseMoneyCents('0.01')
    assert.throws(() => addMoneyCents(max, one))
    assert.throws(() => subtractMoneyCents(min, one))
    assert.throws(() => subtractMoneyCents(max, min))
    assert.strictEqual(formatMoneyCents(subtractMoneyCents(max, one)), '90071992547409.90')
  })
  test('arithmetic and formatting validate their runtime integer operands').with([1.5, NaN,
    Infinity, '1', Number.MAX_SAFE_INTEGER + 1])
    .run(({ assert }, value) => {
      assert.throws(() => addMoneyCents(value))
      assert.throws(() => subtractMoneyCents(parseMoneyCents('0.00'), value))
      assert.throws(() => formatMoneyCents(value))
    })
})


test('already-rounded integers become checked cents without dollar conversion', ({ assert }) => {
  for (const value of [0, -0, 1, -1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
    assert.strictEqual(moneyCentsFromInteger(value), value === 0 ? 0 : value)
  }
  for (const value of [0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, -Number
    .MAX_SAFE_INTEGER - 1]) {
    assert.throws(() => moneyCentsFromInteger(value))
  }
})


test.group('Exact monetary period division', () => {
  test('rounds signed cents and half ties without floating-point division').with([
    [30, 3, 10], [29, 2, 15], [-29, 2, -14], [1, 2, 1], [-1, 2, 0],
    [4, 3, 1], [5, 3, 2], [-4, 3, -1], [-5, 3, -2], [0, 12, 0],
    [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER],
    [Number.MAX_SAFE_INTEGER, 3, 3002399751580330],
    [-Number.MAX_SAFE_INTEGER, 3, -3002399751580330],
    [Number.MAX_SAFE_INTEGER, 2, 4503599627370496],
    [-Number.MAX_SAFE_INTEGER, 2, -4503599627370495],
  ]).run(({ assert }, [value, divisor, expected]) => {
    const result = divideMoneyCents(moneyCentsFromInteger(value), divisor)
    assert.strictEqual(result, expected)
    assert.isFalse(Object.is(result, -0))
  })
  test('rejects invalid period counts').with([0, -1, 1.5, NaN, Infinity,
    Number.MAX_SAFE_INTEGER + 1, '2', null, undefined])
    .run(({ assert }, divisor) => {
      assert.throws(() => divideMoneyCents(parseMoneyCents('1.00'), divisor))
    })
  test('rejects invalid cents').with([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])
    .run(({ assert }, value) => { assert.throws(() => divideMoneyCents(value, 2)) })
})
