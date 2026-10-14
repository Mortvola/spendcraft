import { test } from '@japa/runner'

// Design-only prototypes. No production policy or adapters are implemented.
const maximumCents = 999999999999n
const maximumDollars = Number('9999999999.99')
const view = new DataView(new ArrayBuffer(8))
function bits(value: number): bigint {
  view.setFloat64(0, value)
  return view.getBigUint64(0)
}
function fromBits(value: bigint): number {
  view.setBigUint64(0, value)
  return view.getFloat64(0)
}
function shifted(value: number, steps: bigint): number {
  return fromBits(bits(value) + steps)
}
function dollars(cents: bigint): number {
  return Number(`${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`)
}
function strictDecimal(text: string): bigint | undefined {
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(text.trim())
  if (!match) return undefined
  const [whole, fraction = ''] = match[2].split('.')
  let digits = (whole + fraction).replace(/^0+/, '')
  if (!digits) return 0n
  let shift = 2n + BigInt(match[3] ?? '0') - BigInt(fraction.length)
  if (shift < 0n) {
    const trailingZeros = digits.length - digits.replace(/0+$/, '').length
    if (-shift > BigInt(trailingZeros)) return undefined
    digits = digits.slice(0, digits.length + Number(shift))
    shift = 0n
  }
  if (BigInt(digits.length) + shift > 12n) return undefined
  const result = BigInt(digits) * 10n ** shift
  if (result > maximumCents) return undefined
  return match[1] === '-' ? -result : result
}
function nearestCent(abs: number): bigint {
  const raw = bits(abs)
  const exponent = Number((raw >> 52n) & 2047n)
  const fraction = raw & ((1n << 52n) - 1n)
  const significand = exponent === 0 ? fraction : (1n << 52n) + fraction
  const power = exponent === 0 ? -1074 : exponent - 1023 - 52
  const numerator = power >= 0 ? (significand << BigInt(power)) * 100n : significand * 100n
  const denominator = power >= 0 ? 1n : 1n << BigInt(-power)
  return (2n * numerator + denominator) / (2n * denominator)
}
function recognizedNumber(value: number, steps: bigint): bigint | undefined {
  if (!Number.isFinite(value) || Math.abs(value) > maximumDollars) return undefined
  if (value === 0) return 0n
  const magnitude = Math.abs(value)
  const cents = nearestCent(magnitude)
  // Nonzero subnormals must not become zero merely by being adjacent to zero.
  if (cents === 0n || cents > maximumCents) return undefined
  const distance = bits(magnitude) - bits(dollars(cents))
  if ((distance < 0n ? -distance : distance) > steps) return undefined
  return value < 0 ? -cents : cents
}

test.group('External dollar-to-cents policy design', () => {
  test('known examples compare strict decimal and one/two-adjacent-double candidates', ({ assert }) => {
    for (const [input, cents] of [[0, 0n], [0.01, 1n], [-0.01, -1n], [0.1, 10n], [0.2, 20n], [0.3, 30n],
      [12.34, 1234n], [12.340, 1234n], [maximumDollars, maximumCents]] as const) {
      assert.equal(recognizedNumber(input, 0n), cents)
    }
    for (const value of [0.1 + 0.2, 0.30000000000000004, -0.30000000000000004]) {
      assert.equal(recognizedNumber(value, 1n), value < 0 ? -30n : 30n)
      assert.isUndefined(strictDecimal(String(value)))
    }
    for (const value of [0.004, 0.005, 0.006, 0.301, 0.304, 1.004, 1.005, 1.006, 1.234]) {
      assert.isUndefined(recognizedNumber(value, 2n))
      assert.isUndefined(recognizedNumber(-value, 2n))
    }
  })

  test('adversarial lattice neighborhoods stay disjoint and sign-symmetric at every sampled magnitude', ({ assert }) => {
    for (const cents of [1n, 30n, 100n, 1234n, 100000n, 100000000n, maximumCents - 1n]) {
      const center = dollars(cents)
      for (const offset of [-3n, -2n, -1n, 0n, 1n, 2n, 3n]) {
        const input = shifted(center, offset)
        const result = recognizedNumber(input, 1n)
        assert.equal(result, offset >= -1n && offset <= 1n ? cents : undefined)
        assert.equal(recognizedNumber(-input, 1n), result === undefined ? undefined : -result)
      }
      const next = dollars(cents + 1n)
      assert.isTrue(bits(next) - bits(center) > 4n)
      for (const offset of [0.001, 0.004, 0.005, 0.006, 0.009]) {
        const input = center + offset
        assert.isUndefined(recognizedNumber(input, 2n))
        assert.isUndefined(recognizedNumber(-input, 2n))
      }
      // A double just below the NEXT cent belongs to that cent's neighborhood.
      assert.equal(recognizedNumber(shifted(next, -1n), 1n), cents + 1n)
    }
  })

  test('zero, range edges and full-range spacing distinguish dollars from integer-cent safety', ({ assert }) => {
    assert.equal(recognizedNumber(-0, 1n), 0n)
    for (const value of [Number.MIN_VALUE, -Number.MIN_VALUE, NaN, Infinity, -Infinity,
      shifted(maximumDollars, 1n), -shifted(maximumDollars, 1n), Number.MAX_VALUE]) {
      assert.isUndefined(recognizedNumber(value, 2n))
    }
    assert.equal(recognizedNumber(shifted(maximumDollars, -1n), 1n), maximumCents)
    assert.equal(shifted(maximumDollars, 1n) - maximumDollars, 2 ** -19)
    assert.isTrue(4 * 2 ** -19 < 0.01 - 2 ** -19)
    assert.equal(Number('70368744177664.01'), Number('70368744177664.02'))
    assert.isTrue(Number.isSafeInteger(7036874417766401))
  })

  test('decimal strings retain spelling, exponent and resource-safe scale decisions', ({ assert }) => {
    for (const [text, cents] of [['0.30', 30n], ['12.340', 1234n], ['1e-2', 1n], ['-1e-2', -1n],
      ['0.' + '0'.repeat(2000), 0n], ['12.34' + '0'.repeat(2000), 1234n], ['9999999999.99', maximumCents]] as const) {
      assert.equal(strictDecimal(text), cents)
    }
    for (const text of ['0.30000000000000004', '-0.30000000000000004', '0.005', '1e-400', '1e309',
      '10000000000', '9999999999.991', 'NaN', 'Infinity', '', 'abc', '0x10', '1,234.56']) {
      assert.isUndefined(strictDecimal(text))
    }
  })

  test('arithmetic provenance cannot be recovered from the resulting number', ({ assert }) => {
    const examples = [0.1 + 0.2, 0.7 + 0.1, 0.3 - 0.2, 1.1 + 2.2, 0.1 * 3, 0.1 * 0.1, 0.01 * 0.5,
      Array.from({ length: 100 }, () => 0.01).reduce((sum, amount) => sum + amount, 0),
      Array.from({ length: 1000 }, () => 0.01).reduce((sum, amount) => sum + amount, 0),
      (1000000000 + 0.01) - 1000000000]
    for (const value of examples) {
      console.log(JSON.stringify({ value, strict: strictDecimal(String(value))?.toString() ?? null,
        oneStep: recognizedNumber(value, 1n)?.toString() ?? null,
        twoSteps: recognizedNumber(value, 2n)?.toString() ?? null }))
    }
    assert.isUndefined(recognizedNumber(0.3 - 0.2, 1n))
    assert.equal(recognizedNumber(0.3 - 0.2, 2n), 10n)
    assert.isUndefined(recognizedNumber(examples[8], 2n))
    // This deliberately sub-cent number is exactly the same input as the arithmetic result.
    assert.equal(0.30000000000000004, 0.1 + 0.2)
    assert.equal(recognizedNumber(shifted(0.3, 1n), 1n), 30n)
  })
})
