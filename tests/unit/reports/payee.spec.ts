import { decodePayeeReport } from '../../../client-src/monetary.ts'
import { addMoneyCents, formatMoneyCents } from '../../../common/moneyCents.ts'
import { test } from '@japa/runner'

const row = { rowNumber: '1', name: 'Shop', paymentChannel: 'online', count: 3 }

test('payee amounts retain exact cents and preserve counts and metadata', ({ assert }) => {
  const source = ['0.10', '0.20', '-0.30', '0.00', '90071992547409.91']
    .map(sum => ({ ...row, sum }))
  const before = structuredClone(source)
  const decoded = decodePayeeReport(source)
  assert.deepEqual(decoded.map(r => r.sumCents), [10, 20, -30, 0, Number.MAX_SAFE_INTEGER])
  for (const result of decoded) {
    assert.deepEqual(Object.keys(result).sort(), [...Object.keys(row), 'sumCents'].sort())
    assert.strictEqual(result.count, 3)
    assert.strictEqual(result.name, 'Shop')
    assert.strictEqual(result.paymentChannel, 'online')
    assert.strictEqual(result.rowNumber, '1')
  }
  assert.strictEqual(formatMoneyCents(addMoneyCents(decoded[0].sumCents, decoded[1].sumCents)),
    '0.30')
  assert.strictEqual(formatMoneyCents(decoded[4].sumCents), '90071992547409.91')
  assert.deepEqual(source, before)
  assert.deepEqual(decodePayeeReport([]), [])
})

test('payee decoding rejects noncanonical or unsafe amounts').with([
  '', '1.2', '-0.00', 'NaN', 'Infinity', '90071992547409.92', '-90071992547409.92',
]).run(({ assert }, sum) => {
  assert.throws(() => decodePayeeReport([{ ...row, sum }]))
})
