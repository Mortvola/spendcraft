import { decodeNetworthReport, networthTotals, networthChartData } from
  '../../../client-src/monetary.ts'
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


test('net worth decoding preserves headers and dates, and retains integer cents', ({ assert }) => {
  const rows = [['date', 'Cash', 'Credit'], ['2026-10-01', '0.30', '-12.50'], ['2026-10-02', '0.00',
    '10.00']]
  const before = globalThis.structuredClone(rows)
  assert.deepEqual(decodeNetworthReport(rows), [['date', 'Cash', 'Credit'], ['2026-10-01', 30, -
    1250], ['2026-10-02', 0, 1000]])
  assert.deepEqual(rows, before)
  assert.deepEqual(decodeNetworthReport([['date']]), [['date']])
  for (const amount of ['', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
    assert.throws(() => decodeNetworthReport([['date', 'Cash'], ['2026-10-01', amount]]))
  }
})


test('net worth totals use checked cents and exact chart labels', ({ assert }) => {
  const source = [['date', 'Cash', 'Credit'], ['2026-10-01', '0.10', '0.20'], ['2026-10-02',
    '-0.30', '0.30']]
  const decoded = decodeNetworthReport(source)
  const totals = networthTotals(decoded)
  assert.deepEqual(totals, [['date', 'Cash', 'Credit', 'Net Worth'], ['2026-10-01', 10, 20, 30], [
    '2026-10-02', -30, 30, 0]])
  assert.lengthOf(decoded[0], 3)
  assert.deepEqual(networthChartData(totals)[1], ['2026-10-01', { v: 0.1, f: '0.10' }, { v: 0.2, f:
    '0.20' }, { v: 0.3, f: '0.30' }])
  const large = decodeNetworthReport([['date', 'Cash'], ['2026-10-01', '90071992547409.91']])
  assert.deepEqual(networthChartData(large)[1][1], { v: Number('90071992547409.91'), f:
    '90,071,992,547,409.91' })
  assert.throws(() => networthTotals(decodeNetworthReport([['date', 'Cash', 'Credit'], [
    '2026-10-01', '90071992547409.91', '0.01']])))
  assert.deepEqual(networthTotals(decodeNetworthReport([])), [])
})
