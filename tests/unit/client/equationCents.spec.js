import { test } from '@japa/runner'
import parseEquation, { parseEquationCents } from '../../../client-src/EquationParser.ts'
import { formatMoneyCents } from '../../../common/moneyCents.ts'

test.group('Monetary equation calculator', () => {
  test('evaluates exact cents and rounds only the final result').with([
    ['0.10+0.20', '0.30'], ['0.30-0.10-0.20', '0.00'],
    ['-0.10+0.20', '0.10'], ['-(0.10+0.20)', '-0.30'],
    ['0', '0.00'], ['-0', '0.00'], ['.10 + .20', '0.30'],
    ['0.10*3', '0.30'], ['1/3', '0.33'], ['(1/3)*3', '1.00'],
    ['1/8', '0.13'], ['-1/8', '-0.12'],
    ['1.005', '1.01'], ['-1.005', '-1.00'],
    ['0.004+0.004', '0.01'], ['1/(-8)', '-0.12'],
    ['90071992547409.90+0.01', '90071992547409.91'],
    ['90071992547409.91-90071992547409.90', '0.01'],
  ]).run(({ assert }, [equation, expected]) => {
    const cents = parseEquationCents(equation)
    assert.isTrue(Number.isSafeInteger(cents))
    assert.strictEqual(formatMoneyCents(cents), expected)
  })

  test('rejects invalid, nonfinite and unsafe monetary results').with([
    '', '.', '1.2.3', '1+', '(1', '1)', 'abc', '1/0', '0/0',
    '90071992547409.91+0.01', '-90071992547409.91-0.01',
  ]).run(({ assert }, equation) => {
    assert.throws(() => parseEquationCents(equation))
  })

  test('nonmonetary calculator retains numeric behavior', ({ assert }) => {
    assert.strictEqual(parseEquation('0.1+0.2'), 0.1 + 0.2)
    assert.strictEqual(parseEquation('1/8'), 0.125)
  })
})
