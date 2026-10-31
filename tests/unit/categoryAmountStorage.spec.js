import { parseMoneyCents, addMoneyCents } from '../../common/moneyCents.ts'
import { validateTransactionSplits } from '../../app/validation/transactionSplits.ts'
import { test } from '@japa/runner'
import { BaseModel } from '@adonisjs/lucid/orm'
import { monetaryAmountCents, checkedCentSum, encodeCategoryAllocations, decodeCategoryAllocations,
  encodeMonetaryAmount, validateCategoryConservation, categoryNonzeroAllocationSql } from
    '../../app/services/categoryAmountCodec.ts'
import { bindResolvedCategoryStorage, prepareCategoryStorage, stageCategoryStorage,
  finishCategoryStorageSave, requestCategoryStorage } from
    '../../app/services/categoryStorageBinding.ts'

const split = (amount, categoryId = 1) => ({ categoryId, amount })
class Sample extends BaseModel {}
Sample.boot()
Sample.$addColumn('categories', { prepare: (value, _key, model) => prepareCategoryStorage(value,
  model) })
Sample.$addColumn('comment', {})
function hydrated(categories) {
  const model = new Sample()
  model.merge({ categories, comment: 'old' })
  model.$isPersisted = true
  model.$hydrateOriginals()
  bindResolvedCategoryStorage(model)
  return model
}

test.group('Category decimal-string production boundary without DB', () => {
  test('stored decimal digits stay exact in cents through totals and encoding', ({ assert }) => {
    const raw = [split('0.10'), split('0.20')]
    const decoded = decodeCategoryAllocations(raw)
    assert.strictEqual(addMoneyCents(...decoded.map(row => row.amountCents)),
      parseMoneyCents('0.30'))
    assert.deepEqual(encodeCategoryAllocations(decoded), raw)
    const limit = [split('90071992547409.91'), split('-90071992547409.91')]
    assert.deepEqual(encodeCategoryAllocations(decodeCategoryAllocations(limit)), limit)
    assert.strictEqual(addMoneyCents(...decodeCategoryAllocations(limit).map(
      row => row.amountCents)), parseMoneyCents('0.00'))
  })
  test('runtime encoding rejects dollars, fractional cents and unsafe integers', ({ assert }) => {
    for (const amountCents of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0.30', null]) {
      assert.throws(() => encodeCategoryAllocations([{ categoryId: 1, amountCents }]))
    }
    assert.throws(() => encodeCategoryAllocations([split(0.3)]))
    assert.throws(() => encodeCategoryAllocations([{ ...split(0.3), amountCents: 30 }]))
    assert.throws(() => addMoneyCents(parseMoneyCents('90071992547409.91'),
      parseMoneyCents('0.01')))
  })
  test('approved encoding').with([
    [12.34, '12.34'], [12.345, '12.35'], [-1.005, '-1.00'], [0.1 + 0.2, '0.30'],
    [-0, '0.00'], [0.005, '0.01'], [-0.005, '0.00'], [-12.345, '-12.34'],
  ]).run(({ assert }, [value, expected]) => { assert.equal(encodeMonetaryAmount(value), expected) })
  test('rejects invalid values rather than zero coercion').with([
    null, undefined, NaN, Infinity, -Infinity, {}, [], true, '', '1.2', '1.005', ' 1.00', '1e2',
      '-0.00', '01.00', 'bad', Number.MAX_VALUE,
  ]).run(({ assert }, value) => { assert.throws(() => encodeMonetaryAmount(value)) })
  test('safe integer and formatting overflow are checked', ({ assert }) => {
    assert.throws(() => encodeMonetaryAmount(Number.MAX_SAFE_INTEGER))
    assert.throws(() => encodeMonetaryAmount(Number('90071992547405.12')))
    assert.throws(() => monetaryAmountCents('90071992547409.92'))
    assert.throws(() => checkedCentSum([Number.MAX_SAFE_INTEGER, 1, -1]))
  })
  test('canonical reads preserve integer cents, metadata, order and duplicates', ({
    assert }) => {
    const original = [split('0.30'), { ...split('1.23'), comment: 'keep', baseAmount: 1.005,
      extra: { value: 4 } }, split('-2.00')]
    const before = globalThis.structuredClone(original)
    const decoded = decodeCategoryAllocations(original)
    assert.deepEqual(decoded.map((row) => row.amountCents), [30, 123, -200])
    assert.deepEqual(original, before)
    assert.deepEqual(encodeCategoryAllocations(decoded), [split('0.30'), { ...original[1] }, split(
      '-2.00')])
    assert.deepEqual(encodeCategoryAllocations([]), [])
    assert.throws(() => encodeCategoryAllocations([{ categoryId: 1 }]))
  })
  test('ordinary and opening use signed individually rounded cents').with([0, 4, 5]).run(({
    assert }, type) => {
    validateCategoryConservation(type, [split(-0.1), split(-0.2)], -0.3)
    validateCategoryConservation(type, [split(-1.005)], -1)
    assert.throws(() => validateCategoryConservation(type, [split(0.005), split(0.005)], 0.01))
    assert.throws(() => validateCategoryConservation(type, [], 1))
    assert.throws(() => validateCategoryConservation(type, [split(1)]))
  })
  test('funding requires the scoped Pool and opposite-signed net total', ({ assert }) => {
    validateCategoryConservation(2, [split(1), split(2), split(-3, 99)], undefined, 99)
    assert.throws(() => validateCategoryConservation(2, [split(1), split(-1, 2)], undefined, 99))
    assert.throws(() => validateCategoryConservation(2, [split(1), split(-0.99, 99)], undefined,
      99))
    validateCategoryConservation(3, [split(1), split(2), split(-3)])
    assert.throws(() => validateCategoryConservation(3, [split(0.01)]))
  })
  test('real Lucid dirty tracking stays clean on canonical read and metadata-only save', ({
    assert }) => {
    const model = hydrated([split('1.00'), split('0.30')])
    assert.deepEqual(model.categories.map((row) => row.amountCents), [100, 30])
    assert.isFalse(model.$isDirty)
    model.comment = 'new'
    stageCategoryStorage(model)
    assert.deepEqual(model.prepareForAdapter(model.$dirty), { comment: 'new' })
    finishCategoryStorageSave(model)
    assert.equal(model.categories[1].amountCents, 30)
  })
  test('real Lucid nested writes encode strings and leave numeric API/clean original', ({
    assert }) => {
    const model = hydrated([split('1.00')])
    model.categories[0].amountCents = parseMoneyCents(encodeMonetaryAmount(12.345))
    stageCategoryStorage(model)
    const payload = model.prepareForAdapter(model.$dirty)
    assert.deepEqual(JSON.parse(payload.categories), [split('12.35')])
    model.$hydrateOriginals()
    finishCategoryStorageSave(model)
    assert.deepEqual(model.serialize().categories, [{ categoryId: 1, amountCents: 1235 }])
    assert.isFalse(model.$isDirty)
    assert.throws(() => {
      const dirty = new Sample().merge({ categories: [split(1)] })
      dirty.$isPersisted = true
      bindResolvedCategoryStorage(dirty)
    }, 'Bind Category storage before allocation mutation')
  })
  test(
    'unbound deprecated model preparation is unchanged; deleted mismatches are not globally \
validated', ({ assert }) => {
    const model = new Sample().merge({ categories: [split(1.005)] })
    requestCategoryStorage(model, false)
    assert.deepEqual(JSON.parse(model.prepareForAdapter(model.$attributes).categories), [split(
      1.005)])
    const empty = hydrated([])
    empty.comment = 'metadata on deleted history'
    stageCategoryStorage(empty)
    assert.notProperty(empty.prepareForAdapter(empty.$dirty), 'categories')
  })
  test('membership SQL casts both JSON representations without row fan-out or zero fallback', ({
    assert }) => {
    assert.include(categoryNonzeroAllocationSql, 'EXISTS')
    assert.include(categoryNonzeroAllocationSql,
      "COALESCE(allocation.value->>'amount', 'invalid')::numeric <> 0")
    assert.notInclude(categoryNonzeroAllocationSql, 'transaction_categories')
  })
})

// Hooks' scope resolution is exercised with inert SQL collaborators, not another scope
// implementation.
test('actual scope resolver batches active rows including Loans and rejects foreign ownership',
  async ({ assert }) => {
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const { default: ts } = await import('typescript')
  const { bound, requested } = await import('../../app/services/categoryStorageBinding.ts')
  const source = ts.createSourceFile('scope.ts', await readFile(
    'app/services/transactionCategoryStorage.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const member = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name
    ?.text === 'bindCategoryStorage')
  const owner = {}
  const queries = []
  function row(id, type) {
    const attributes = { categories: [split('1.00', id === 6 ? 6 : 1)] }
    return { id, type, budgetId: 7, $isPersisted: true, $trx: owner, $attributes: attributes,
      $original: globalThis.structuredClone(attributes), $dirty: {},
      get categories() { return attributes.categories } }
  }
  const rows = [row(1, 0), row(2, 2), row(3, 4), row(4, 5), row(5, 0), row(6, 3)]
  const resolver = runInNewContext(ts.transpileModule(`(${member.getText(source).replace(
    /^export\s+/, '')})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    bound, requested, excludeCategoryStorage: () => undefined, supported: [0, 2, 3, 4, 5],
      bindResolvedCategoryStorage,
    db: { from(table) {
      queries.push(table)
      return { if(value, callback) { if (value) callback(this); return this },
        useTransaction(client) { assert.strictEqual(client, owner); return this },
        join() { return this }, whereIn() { return this }, where() { return this },
        async select() { return table === 'categories' ? [{ id: 6 }] : [
          { transaction_id: 1, type: 'depository', application_id: 7 },
          { transaction_id: 3, type: 'depository', application_id: 7 },
          { transaction_id: 4, type: 'loan', application_id: 7 },
          { transaction_id: 5, type: 'depository', application_id: 8 },
        ] },
      }
    } },
  })
  await resolver(rows)
  assert.deepEqual(rows.map((entry) => entry.categories[0].amountCents
    ?? entry.categories[0].amount), [100, 100, 100, 100, '1.00', 100])
  assert.deepEqual(queries, ['account_transactions as at'])
  await resolver(rows.slice(0, 3))
  assert.lengthOf(queries, 1)
  const newOpening = row(7, 4)
  newOpening.$attributes.categories = [{ categoryId: 1, amountCents: parseMoneyCents('1.00') }]
  newOpening.$isPersisted = false
  requestCategoryStorage(newOpening)
  await resolver([newOpening])
  assert.equal(newOpening.categories[0].amountCents, 100)
})

test('active validation and canonical numeric posting preserve the approved negative half tie',
  async ({ assert }) => {
  const { canonicalCategoryAllocations } = await import('../../app/services/categoryAmountCodec.ts')
  const input = [split(-1.125)]
  validateTransactionSplits(-1.12, input)
  assert.deepEqual(canonicalCategoryAllocations(input), [split(-1.12)])
  assert.equal(input[0].amount, -1.125)
  assert.throws(() => validateTransactionSplits(-1.13, input))
})

test('actual active-new save guard rejects a missing owning transaction before scope queries',
  async ({ assert }) => {
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const { default: ts } = await import('typescript')
  const { requested } = await import('../../app/services/categoryStorageBinding.ts')
  const source = ts.createSourceFile('guard.ts', await readFile(
    'app/services/transactionCategoryStorage.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const member = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name
    ?.text === 'prepareNewCategoryStorage')
  const run = runInNewContext(ts.transpileModule(`(${member.getText(source).replace(/^export\s+/,
    '')})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { requested })
  const target = requestCategoryStorage(new Sample().merge({ categories: [split(1)] }))
  await assert.rejects(() => run(target), 'Category storage requires an owning transaction')
})

test('stored Category allocations require canonical strings', ({ assert }) => {
  for (const amount of [0, -0, 1, -1, 1.005, '1.0', '1e0', '-0.00']) {
    assert.throws(() => decodeCategoryAllocations([split(amount)]))
    assert.throws(() => hydrated([split(amount)]))
  }
})


test('split validation checks signed totals, invalid amounts and safe cent accumulation', ({
  assert }) => {
  validateTransactionSplits(0.3, [split(0.1), split(0.2)])
  validateTransactionSplits(-0.3, [split(-0.1), split(-0.2)])
  validateTransactionSplits(0, [split(-0.1), split(0.1)])
  assert.throws(() => validateTransactionSplits(0.3, [split(0.1)]))
  assert.throws(() => validateTransactionSplits(0, [split(0.1)]),
    'The sum of the categories does not match the transaction amount.')
  assert.throws(() => validateTransactionSplits(1, [split(0)], 'Custom mismatch'),
    'Custom mismatch')
  for (const amount of [NaN, Infinity, -Infinity, 1e16]) {
    assert.throws(() => validateTransactionSplits(amount, []))
    assert.throws(() => validateTransactionSplits(0, [split(amount)]))
  }
  assert.throws(() => validateTransactionSplits(0, Array.from({ length: 3 }, () =>
    split(45035996273704))), 'Unsafe Category allocation cent total')
})
