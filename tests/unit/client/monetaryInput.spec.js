import { test } from '@japa/runner'
import { inputMoneyCents } from '../../../client-src/monetary.ts'

test.group('Exact fractional monetary input', () => {
  test('parses decimal text and rounds half ties toward positive infinity').with([
    ['0.10', 10], ['0.20', 20], ['1.005', 101], ['-1.005', -100],
    ['0.125', 13], ['-0.125', -12], ['0.005', 1], ['-0.005', 0],
    ['0.004999999999999999999', 0], ['0.005000000000000000001', 1],
    ['-0.005000000000000000001', -1], ['12.345', 1235],
    ['.5', 50], ['1.', 100], ['+001.20', 120], [' 1.25 ', 125],
    ['', 0], ['  ', 0], ['-0.00', 0],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
    ['90071992547409.909', Number.MAX_SAFE_INTEGER],
    ['-90071992547409.915', -Number.MAX_SAFE_INTEGER],
  ]).run(({ assert }, [text, expected]) => {
    assert.strictEqual(inputMoneyCents(text), expected)
    assert.isFalse(Object.is(inputMoneyCents(text), -0))
  })

  test('applies account sign before rounding', ({ assert }) => {
    assert.strictEqual(inputMoneyCents('0.125', -1), -12)
    assert.strictEqual(inputMoneyCents('-0.125', -1), 13)
    assert.strictEqual(inputMoneyCents('0.10', -1), -10)
  })

  test('rejects malformed text and unsafe rounded results').with([
    '.', '-', '1.2.3', '12abc', 'NaN', 'Infinity', '0x10', '1e2',
    '90071992547409.915', '-90071992547409.916',
  ]).run(({ assert }, text) => {
    assert.throws(() => inputMoneyCents(text))
  })

  test('rejects numeric dollars and invalid signs', ({ assert }) => {
    for (const value of [0, 1.005, -0.125, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => inputMoneyCents(value))
    }
    assert.throws(() => inputMoneyCents('1.00', 0))
  })
})
