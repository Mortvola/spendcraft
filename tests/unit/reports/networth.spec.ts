import { decodeNetworthReport } from '../../../client-src/monetary.ts'
import { test } from '@japa/runner'
import { isNetworthReport } from '#common/ResponseTypes'

test.group('Net worth report validation', () => {
  test('accepts string headers, dates and monetary cells').with([
    [], [[]], [['Date', 'Account'], ['2026-10-07', '123.45']],
    [['Unicode: é', '-1.00', '0.00', '']],
  ]).run(({ assert }, value) => {
    assert.isTrue(isNetworthReport(value))
  })

  test('rejects malformed responses').with([
    null, undefined, {}, 'report', 42, [1], ['row'], [null], [{}],
    [[1]], [[true]], [[null]], [[undefined]], [[{}]], [[[1]]],
    [['valid', 1], ['invalid', false]],
  ]).run(({ assert }, value) => {
    assert.isFalse(isNetworthReport(value))
  })
})


test('net worth decoding preserves headers and dates, and supplies numeric chart cells', ({ assert }) => {
  const rows = [['date', 'Cash', 'Credit'], ['2026-10-01', '0.30', '-12.50'], ['2026-10-02', '0.00', '10.00']]
  const before = globalThis.structuredClone(rows)
  assert.deepEqual(decodeNetworthReport(rows), [['date', 'Cash', 'Credit'], ['2026-10-01', 0.3, -12.5], ['2026-10-02', 0, 10]])
  assert.deepEqual(rows, before)
  assert.deepEqual(decodeNetworthReport([['date']]), [['date']])
  for (const amount of ['', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
    assert.throws(() => decodeNetworthReport([['date', 'Cash'], ['2026-10-01', amount]]))
  }
})
