import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import { roundAutoAssignmentAmount } from '../../app/services/autoAssignmentAmount.ts'
import Model from '../../app/Models/AutoAssignmentCategory.ts'
import Migration, { historicalAmountExpression } from '../../database/migrations/1792100000000_auto_assignment_amount_numeric.ts'
import { addAutoAssignment, updateAutoAssignment } from '../../app/validation/Validators/autoAssignment.ts'
import { loadAllocator } from '../../scripts/auditAutoAssignmentPrecision.mjs'

const values = [[12.345, 12.35], [12.75, 12.75], [0.125, 0.13], [-0.125, -0.12],
  [1.005, 1], [-1.005, -1], [0.1 + 0.2, 0.3], [0, 0], [-0, 0], [9999999999.99, 9999999999.99]]
for (const [input, expected] of values) test(`approved rounding ${input}`, () => {
  assert.equal(roundAutoAssignmentAmount(input), expected)
  assert.equal(Object.is(roundAutoAssignmentAmount(input), -0), false)
})
for (const input of [null, undefined, '', '1.25', NaN, Infinity, -Infinity, 10000000000, -10000000000, Number.MAX_SAFE_INTEGER]) {
  test(`invalid amount rejected: ${String(input)}`, () => assert.throws(() => roundAutoAssignmentAmount(input)))
}
for (const [name, validator] of [['CREATE', addAutoAssignment], ['PATCH', updateAutoAssignment]]) {
  test(`${name} accepts canonical fixed dollars and numeric percentages and rejects unsafe input`, async () => {
    for (const percentage of [true, false]) {
      const output = await validator.validate({ name: 'test', searchStrings: ['test'],
        categories: [{ id: -1, categoryId: 1, amount: percentage ? 12.345 : '12.35', percentage }] })
      assert.equal(output.categories[0].amount, percentage ? 12.345 : 12.35) // Quantization is the model persistence boundary.
      assert.equal(output.categories[0].percentage, percentage)
    }
    for (const amount of [null, Infinity, 10000000000, -10000000000]) {
      await assert.rejects(validator.validate({ name: 'test', searchStrings: ['test'],
        categories: [{ id: -1, categoryId: 1, amount, percentage: true }] }))
    }
  })
}
test('actual model normalizes dirty money, prepares exact decimal text and hydrates numeric APIs', () => {
  const row = new Model(); row.amount = -0.125; row.percentage = true
  Model.roundAmount(row)
  assert.equal(row.amount, -0.12); assert.equal(typeof row.serialize().amount, 'number')
  const column = Model.$getColumn('amount')
  assert.equal(column.prepare(-0.125), '-0.12')
  assert.equal(column.consume('12.75'), 12.75)
  assert.equal(column.consume(12.75), 12.75)
  row.percentage = false; row.amount = 10.255; Model.roundAmount(row)
  assert.equal(row.amount, Math.round(10.255 * 100) / 100); assert.equal(row.percentage, false)
})
const historical = (amount = -0.125, extra = {}) => ({ id: 1, auto_assignment_id: 2, category_id: 3,
  amount, percentage: null, real_hex: 'be000000', ...extra })
test('historical DDL uses JavaScript results, original bits/mode/ownership and fail-closed unknown rows', () => {
  const sql = historicalAmountExpression([historical()])
  assert.match(sql, /'-0.12'::numeric\(12,2\)/)
  assert.match(sql, /auto_assignment_id=2 AND category_id=3/)
  assert.match(sql, /percentage IS NOT DISTINCT FROM NULL/)
  assert.match(sql, /float4send\(amount\)/)
  assert.match(sql, /ELSE NULL::numeric\(12,2\)/)
  assert.doesNotMatch(sql, /amount::numeric|UPDATE|DROP COLUMN/)
  assert.equal(historicalAmountExpression([]), 'NULL::numeric(12,2)')
})
test('historical rows reject duplicates, malformed SQL tokens and unsafe values before DDL', () => {
  for (const rows of [[historical(), historical()], [historical(1e20)], [historical(1, { id: '1;DROP' })],
    [historical(1, { real_hex: "';DROP TABLE" })], [historical(1, { percentage: 'false' })], [null]]) {
    assert.throws(() => historicalAmountExpression(rows))
  }
})
test('migration runs on owning transaction, locks only Budgets and forbids lossy down', async () => {
  const migration = new Migration({}, 'offline', false)
  let callback
  migration.defer = fn => { callback = fn }
  await migration.up()
  const calls = []
  const db = { isTransaction: true, raw: sql => sql,
    from: () => ({ select: async () => [historical()] }),
    rawQuery: async sql => { calls.push(sql); return { rows: [{ is_real: true, not_null: true }] } } }
  await callback(db)
  assert.match(calls.find(s => s.includes('FOR UPDATE')), /ORDER BY b.id FOR UPDATE OF b/)
  assert.match(calls.at(-1), /ALTER COLUMN amount TYPE numeric\(12,2\)/)
  assert.equal(calls.filter(s => s.includes('ALTER TABLE')).length, 1)
  await assert.rejects(migration.down(), /lossy_requires_recovery_review/)
  await assert.rejects(callback({ ...db, isTransaction: false }), /transaction_required/)
})
test('invalid historical input aborts before type change', async () => {
  const migration = new Migration({}, 'offline', false)
  let callback; migration.defer = fn => { callback = fn }; await migration.up()
  const calls = []
  await assert.rejects(callback({ isTransaction: true, raw: sql => sql,
    from: () => ({ select: async () => [historical(Infinity)] }),
    rawQuery: async sql => { calls.push(sql); return { rows: [{ is_real: true, not_null: true }] } } }))
  assert.equal(calls.some(s => s.includes('ALTER TABLE')), false)
})
test('rounded fixed and fractional-percentage inputs retain the actual allocation formulas and residual', async () => {
  const allocator = await loadAllocator()
  const rules = [{ id: 1, category_id: 1, amount: roundAutoAssignmentAmount(10.005), percentage: false },
    { id: 2, category_id: 2, amount: roundAutoAssignmentAmount(12.745), percentage: true },
    { id: 3, category_id: 3, amount: 87.25, percentage: true }]
  const result = await allocator.execute(rules, 100)
  assert.deepEqual(result.allocations.map(a => a.amount), [10.01, 11.47, 78.52])
  assert.equal(result.totalCents, 10000); assert.equal(result.conservesNominalCents, true)
  const residual = await allocator.execute([{ ...rules[1], amount: 50 }, { ...rules[2], amount: 50 }], 0.01)
  assert.deepEqual(residual.allocations.map(a => a.amount), [0.01, 0])
  assert.equal(residual.finalResidualCents, -1)
})
test('existing controller transaction/ownership paths remain present for CREATE and PATCH', async () => {
  const source = await readFile(new URL('../../app/Controllers/Http/AutoAssignmentsController.ts', import.meta.url), 'utf8')
  assert.equal((source.match(/validateUsing\((addAutoAssignment|updateAutoAssignment)\)/g) ?? []).length, 2)
  assert.match(source, /forUpdate\(\)/); assert.match(source, /client: trx/)
  assert.match(source, /await trx.commit\(\)/); assert.match(source, /await trx.rollback\(\)/)
})
