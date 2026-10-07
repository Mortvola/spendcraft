import { test } from '@japa/runner'
import { isNetworthReport } from '#common/ResponseTypes'

test.group('Net worth report validation', () => {
  test('accepts rows containing only strings and numbers').with([
    [], [[]], [[1, 2], [3]], [['Date', 'Account'], ['2026-10-07', 123.45]],
    [['Unicode: é', -1, 0, '']],
  ]).run(({ assert }, value) => {
    assert.isTrue(isNetworthReport(value))
  })

  test('rejects malformed responses').with([
    null, undefined, {}, 'report', 42, [1], ['row'], [null], [{}],
    [[true]], [[null]], [[undefined]], [[{}]], [[[1]]],
    [['valid', 1], ['invalid', false]],
  ]).run(({ assert }, value) => {
    assert.isFalse(isNetworthReport(value))
  })
})
