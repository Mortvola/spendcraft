import { test } from '@japa/runner'

/** Test-only candidate for Policy A; not an implemented product decision. */
function candidateCents(value: number | string): bigint | undefined {
  const amount = Number(value)
  if (!Number.isFinite(amount) || (typeof value === 'string' && value.trim() === '')) return undefined
  const [mantissa, exponent = '0'] = Math.abs(amount).toString().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const digits = whole + fraction
  const shift = 2 + Number(exponent) - fraction.length
  if (shift < 0 && (-shift > digits.length || !digits.endsWith('0'.repeat(-shift)))) return undefined
  const cents = shift >= 0 ? BigInt(digits) * 10n ** BigInt(shift)
    : BigInt(digits.slice(0, digits.length + shift) || '0')
  return amount < 0 ? -cents : cents
}

test.group('Currency precision policy design', () => {
  test('strict canonical-decimal detection distinguishes supported scale from binary-derived noise', ({ assert }) => {
    for (const [amount, cents] of [[1, 100n], [1.2, 120n], [1.23, 123n], [-1.23, -123n], [0.29, 29n], [0, 0n]] as const) {
      assert.equal(candidateCents(amount), cents)
    }
    assert.equal(candidateCents('1.230'), 123n)
    assert.equal(candidateCents('1e-2'), 1n)
    assert.equal(candidateCents(1e21), 10n ** 23n)
    for (const value of [0.004, 0.005, -0.005, 1.234, -1.234, 1e-7, 0.1 + 0.2]) assert.isUndefined(candidateCents(value))
    assert.isUndefined(candidateCents('abc'))
    assert.isUndefined(candidateCents(Infinity))
  })

  test('JavaScript rounding is not symmetric at negative ties or reliably decimal at positive ties', ({ assert }) => {
    assert.equal(Math.round(0.005 * 100) / 100, 0.01)
    assert.isTrue(Object.is(Math.round(-0.005 * 100) / 100, -0))
    assert.equal(Math.round(1.005 * 100) / 100, 1)
    assert.equal(1.005.toFixed(2), '1.00')
    for (const amount of [0.004, 0.005, 0.006, -0.004, -0.005, -0.006,
      1.004, 1.005, 1.006, -1.004, -1.005, -1.006]) {
      console.log(JSON.stringify({ amount, round: Math.round(amount * 100) / 100,
        signedMagnitudeRound: Math.sign(amount) * Math.round(Math.abs(amount) * 100) / 100,
        fixed: amount.toFixed(2), negativeZero: Object.is(Math.round(amount * 100) / 100, -0) }))
    }
  })
})
