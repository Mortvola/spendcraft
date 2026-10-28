import { test } from '@japa/runner'
import { addTransaction, updateTransaction } from '../../app/validation/Validators/transaction.ts'
import { encodeAmount } from '../../client-src/monetary.ts'

test.group('Transaction monetary request contract', () => {
  const create = value => ({ date: '2026-01-01', name: 'Transaction', amount: value,
    principle: value, categories: [{ categoryId: 1, amount: value, comment: 'keep' }] })
  const patch = value => ({ version: 2, amount: value, principle: value,
    categories: [{ categoryId: 1, amount: value, comment: 'keep' }],
    taxCategories: [{ type: 'estimated_tax_payments', amount: value }] })
  test('client rounding yields canonical requests and validators return numeric runtime values').with([
    [12.345, '12.35'], [-0.125, '-0.12'], [0.125, '0.13'], [1.005, '1.00'],
    [0.1 + 0.2, '0.30'], [-0.005, '0.00'], [-0, '0.00'], [0, '0.00'],
  ]).run(async ({ assert }, [amount, expected]) => {
    assert.strictEqual(encodeAmount(amount), expected)
    const added = await addTransaction.validate(create(expected))
    const updated = await updateTransaction.validate(patch(expected))
    for (const values of [added, updated]) {
      assert.strictEqual(values.amount, Number(expected))
      assert.strictEqual(values.principle, Number(expected))
      assert.deepEqual(values.categories, [{ categoryId: 1, amount: Number(expected), comment: 'keep' }])
    }
    assert.deepEqual(updated.taxCategories, [{ type: 'estimated_tax_payments', amount: Number(expected) }])
    assert.strictEqual(updated.version, 2)
  })
  test('every supplied monetary field rejects numeric, noncanonical or unsafe input').with([
    1, 0, -0, null, true, '', '1', '1.2', '1.005', '1e2', '+1.00', '01.00', '-0.00',
    ' 1.00 ', 'Infinity', '90071992547409.92', Infinity, NaN,
  ]).run(async ({ assert }, value) => {
    for (const [validator, fixture] of [[addTransaction, create], [updateTransaction, patch]]) {
      for (const field of ['amount', 'principle', 'categories', ...(validator === updateTransaction ? ['taxCategories'] : [])]) {
        const values = fixture('1.00')
        if (field === 'categories' || field === 'taxCategories') values[field][0].amount = value
        else values[field] = value
        if (value === null && (field === 'principle' || (field === 'amount' && validator === updateTransaction))) {
          assert.notProperty(await validator.validate(values), field)
        } else await assert.rejects(() => validator.validate(values))
      }
    }
  })
  test('metadata-only PATCH preserves omitted amounts and existing validation', async ({ assert }) => {
    const values = await updateTransaction.validate({ version: 1, name: ' Renamed ', statementId: null })
    assert.deepEqual(values, { version: 1, name: 'Renamed', statementId: null })
    await assert.rejects(() => addTransaction.validate({ date: '2026-01-01', name: 'Missing', categories: [] }))
    await assert.rejects(() => updateTransaction.validate({ amount: '1.00' }))
  })
})
