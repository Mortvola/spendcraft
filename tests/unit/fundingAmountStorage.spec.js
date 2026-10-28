import { test } from '@japa/runner'
import { BaseModel } from '@adonisjs/lucid/orm'
import Category from '../../app/Models/Category.ts'
import { encodeFundingRules, decodeFundingRules, encodeFundingMetadata, decodeFundingMetadata } from '../../app/services/fundingAmountCodec.ts'
import { consumeFundingStorage, requestFundingStorage, stageFundingStorage, prepareFundingStorage } from '../../app/services/fundingStorage.ts'
import { bindResolvedCategoryStorage, prepareCategoryStorage, stageCategoryStorage, finishCategoryStorageSave } from '../../app/services/categoryStorageBinding.ts'
import { validateCategoryConservation } from '../../app/services/categoryAmountCodec.ts'
import { updateCategoryTransfer } from '../../app/validation/Validators/categoryTransfer.ts'
import { calculateFunding } from '../../client-src/Funding/calculateFunding.ts'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { EventEmitter } from 'node:events'
import * as binding from '../../app/services/categoryStorageBinding.ts'
import { encodeCategoryAllocations } from '../../app/services/categoryAmountCodec.ts'

const rule = (amount, percentage = false) => ({ categoryId: 99, amount, percentage })
const allocation = baseAmount => [{ categoryId: 10, amount: '1.00', baseAmount,
  fundingCategories: [rule(baseAmount), rule(baseAmount, true)], comment: 'keep', funder: false }]
class Sample extends BaseModel {}
Sample.boot()
Sample.$addColumn('categories', { prepare: (value, _key, row) => prepareCategoryStorage(value, row) })
Sample.$addColumn('comment', {})
function hydrated(raw) {
  const row = new Sample().merge({ categories: raw, comment: 'old' })
  row.$isPersisted = true; row.$hydrateOriginals(); bindResolvedCategoryStorage(row)
  return row
}
function persist(row) {
  stageFundingStorage(row, 'categories'); stageCategoryStorage(row)
  const values = row.prepareForAdapter(row.$dirty)
  row.$hydrateOriginals(); finishCategoryStorageSave(row)
  return values
}

test.group('Funding JSON storage (no database)', () => {
  test('actual Loan scope resolves before funding encoding').with([
    'create', 'replacement', 'read', 'linked Loan', 'supported replacement',
  ]).run(async ({ assert }, scenario) => {
    const source = ts.createSourceFile('scope.ts', await readFile('app/services/transactionCategoryStorage.ts', 'utf8'), ts.ScriptTarget.Latest, true)
    const functions = source.statements.filter(node => ts.isFunctionDeclaration(node)
      && ['bindCategoryStorage', 'prepareNewCategoryStorage'].includes(node.name?.text))
      .map(node => node.getText(source).replace(/^export\s+/, '')).join('\n')
    const owner = new EventEmitter(), queries = []
    const raw = scenario === 'replacement' || scenario === 'supported replacement'
      ? allocation('1.00') : allocation(1.005)
    const row = new Sample().merge({ categories: raw })
    row.id = 1; row.type = 2; row.budgetId = 7
    row.$isPersisted = scenario !== 'create'; row.$hydrateOriginals()
    row.useTransaction(owner)
    let loan = scenario !== 'supported replacement'
    const scope = runInNewContext(ts.transpileModule(`${functions}\n({ bindCategoryStorage, prepareNewCategoryStorage })`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      ...binding, supported: [0, 2, 3, 4, 5], stageFundingStorage, encodeCategoryAllocations,
      db: { from(table) {
        queries.push(table)
        return { if(value, callback) { if (value) callback(this); return this },
          useTransaction(client) { assert.strictEqual(client, owner); return this },
          join() { return this }, whereIn() { return this }, where() { return this },
          select() { return this },
          then(resolve) { return Promise.resolve(table === 'categories'
            ? (loan && scenario !== 'linked Loan' ? [{ id: 10 }] : [])
            : (scenario === 'linked Loan' ? [{ transaction_id: 1, type: 'loan', application_id: 7 }] : [])).then(resolve) },
        }
      } },
    })
    if (scenario === 'replacement') {
      loan = false
      await scope.bindCategoryStorage([row])
      loan = true
      row.categories = allocation(3)
    } else if (scenario === 'read' || scenario === 'linked Loan') {
      await scope.bindCategoryStorage([row])
      assert.deepEqual(row.categories, raw)
      assert.isFalse(row.$isDirty)
    }
    if (scenario === 'create' || scenario === 'supported replacement') binding.requestCategoryStorage(row)
    if (scenario !== 'read') requestFundingStorage(row)
    const modelSource = ts.createSourceFile('Transaction.ts', await readFile('app/Models/Transaction.ts', 'utf8'), ts.ScriptTarget.Latest, true)
    const model = modelSource.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'Transaction')
    const hook = model.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(modelSource) === 'encodeActiveCategories')
    const save = runInNewContext(ts.transpileModule(`(async function(transaction) ${hook.body.getText(modelSource)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, { prepareNewCategoryStorage: scope.prepareNewCategoryStorage, stageFundingStorage,
      prepareTaxStorageSave: async () => undefined })
    await save(row)
    const stored = JSON.parse(row.prepareForAdapter({ categories: row.categories }).categories)
    if (scenario === 'supported replacement') {
      assert.equal(stored[0].baseAmount, '1.00')
      assert.deepEqual(stored[0].fundingCategories, [rule('1.00'), rule('1.00', true)])
      row.$hydrateOriginals(); finishCategoryStorageSave(row)
      assert.strictEqual(row.serialize().categories[0].baseAmount, 1)
    } else {
      assert.deepEqual(stored, scenario === 'replacement' ? allocation(3) : raw)
      assert.isFalse(binding.bound.has(row))
    }
    assert.isAbove(queries.length, 0)
  })
  test('all three paths and both modes use approved individual rounding').with([
    [12.345, '12.35'], [0.125, '0.13'], [-0.125, '-0.12'], [1.005, '1.00'], [-1.005, '-1.00'],
    [0.1 + 0.2, '0.30'], [0, '0.00'], [-0, '0.00'], [0.005, '0.01'], [-0.005, '0.00'],
  ]).run(({ assert }, [value, stored]) => {
    assert.deepEqual(encodeFundingRules([rule(value), rule(value, true)]), [rule(stored), rule(stored, true)])
    const encoded = encodeFundingMetadata(allocation(value))[0]
    assert.equal(encoded.baseAmount, stored)
    assert.deepEqual(encoded.fundingCategories, [rule(stored), rule(stored, true)])
    assert.equal(encoded.amount, '1.00'); assert.equal(encoded.comment, 'keep')
  })
  test('malformed, nonfinite, unsafe and noncanonical scalars reject').with([
    true, {}, [], NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE,
    '', '1.2', '1.005', '1e2', '01.00', '-0.00', '90071992547409.92',
  ]).run(({ assert }, value) => {
    assert.throws(() => encodeFundingRules([rule(value)]))
    assert.throws(() => encodeFundingMetadata(allocation(value)))
    assert.throws(() => decodeFundingMetadata(allocation(value)))
  })
  test('canonical reads expose numbers and do not mutate raw JSON or modes', ({ assert }) => {
    const raw = [{ ...allocation('1.00')[0], fundingCategories: [rule('12.35'), rule('33.33', true),
      { ...rule('-0.12', null), extra: { amount: 1.005 } }], note: [2, 1, 2] }]
    const before = globalThis.structuredClone(raw), decoded = decodeFundingMetadata(raw)
    assert.equal(decoded[0].baseAmount, 1)
    assert.deepEqual(decoded[0].fundingCategories.map(r => r.amount), [12.35, 33.33, -0.12])
    assert.isNull(decoded[0].fundingCategories[2].percentage)
    assert.deepEqual(raw, before); assert.deepEqual(decoded[0].note, raw[0].note)
  })
  test('missing/null roots, parents and leaves retain their exact semantics', ({ assert }) => {
    for (const value of [null, undefined]) {
      assert.strictEqual(encodeFundingRules(value), value)
      assert.strictEqual(decodeFundingMetadata(value), value)
    }
    const raw = [{ categoryId: 1, amount: '0.00' }, { categoryId: 2, amount: '0.00', baseAmount: null,
      fundingCategories: null }, { categoryId: 3, amount: '0.00', fundingCategories: [{ categoryId: 4, percentage: true }, rule(null)] }]
    assert.deepEqual(encodeFundingMetadata(raw), raw)
    assert.deepEqual(decodeFundingMetadata(raw), raw)
    assert.deepEqual(decodeFundingRules([rule(null), { categoryId: 1 }]), [rule(null), { categoryId: 1 }])
  })
  test('Category model persists strings and exposes rounded numeric API values', async ({ assert }) => {
    class Model extends Category {}
    Model.boot()
    const writes = []
    Model.$adapter = { query() { return { client: { dialect: { dateTimeFormat: 'yyyy-MM-dd HH:mm:ss.SSSZZ' } } } },
      async insert(_row, values) { writes.push(values) }, async update(_row, values) { writes.push(values) } }
    const row = new Model().merge({ id: 1, fundingCategories: [rule(-0.125), rule(12.345, true)] })
    await row.save()
    assert.deepEqual(JSON.parse(writes[0].funding_categories), [rule('-0.12'), rule('12.35', true)])
    assert.deepEqual(row.serialize().fundingCategories, [rule('-0.12'), rule(12.35, true)])
    assert.isFalse(row.$isDirty)
    const raw = [rule('1.00'), rule('2.00', true)]
    const old = Model.$createFromAdapterResult({ id: 2, type: 'BILL', funding_categories: raw, name: 'old' })
    assert.deepEqual(old.fundingCategories, [rule(1), rule(2, true)])
    await old.save(); assert.lengthOf(writes, 1)
    old.name = 'new'; await old.save(); assert.notProperty(writes[1], 'funding_categories')
    old.fundingCategories[0].note = 'metadata'; await old.save()
    assert.deepEqual(JSON.parse(writes[2].funding_categories), [{ ...raw[0], note: 'metadata' }, raw[1]])
    requestFundingStorage(old); await old.save()
    assert.deepEqual(JSON.parse(writes[3].funding_categories), [{ ...raw[0], amount: '1.00', note: 'metadata' }, raw[1]])
    assert.deepEqual(raw, [rule('1.00'), rule('2.00', true)])
  })
  test('bound Transaction reads, scalar and nested metadata-only saves retain historical leaves', ({ assert }) => {
    const raw = allocation('1.00'), row = hydrated(raw)
    assert.isFalse(row.$isDirty)
    assert.deepEqual(persist(row), {})
    row.comment = 'new'; assert.deepEqual(persist(row), { comment: 'new' })
    row.categories[0].comment = 'changed'
    const stored = JSON.parse(persist(row).categories)
    assert.equal(stored[0].baseAmount, '1.00')
    assert.deepEqual(stored[0].fundingCategories, raw[0].fundingCategories)
    assert.equal(stored[0].amount, '1.00')
    assert.isFalse(row.$isDirty)
  })
  test('explicit replacement encodes even unchanged legacy leaves and restores numeric APIs', ({ assert }) => {
    const row = hydrated(allocation('1.00'))
    requestFundingStorage(row)
    const stored = JSON.parse(persist(row).categories)
    assert.equal(stored[0].baseAmount, '1.00')
    assert.deepEqual(stored[0].fundingCategories, [rule('1.00'), rule('1.00', true)])
    assert.strictEqual(row.serialize().categories[0].baseAmount, 1)
    assert.deepEqual(row.categories[0].fundingCategories, [rule(1), rule(1, true)])
    assert.isFalse(row.$isDirty)
  })
  test('editing one metadata leaf does not normalize historical siblings', ({ assert }) => {
    const row = hydrated(allocation('1.00'))
    row.categories[0].fundingCategories[1].amount = 12.345
    const stored = JSON.parse(persist(row).categories)[0]
    assert.equal(stored.baseAmount, '1.00'); assert.equal(stored.fundingCategories[0].amount, '1.00')
    assert.equal(stored.fundingCategories[1].amount, '12.35')
    assert.equal(row.categories[0].fundingCategories[1].amount, 12.35)
  })
  test('invalid metadata fails before adapter persistence and does not change sibling data', ({ assert }) => {
    const row = hydrated(allocation('1.00')), original = globalThis.structuredClone(row.$original)
    row.categories[0].baseAmount = Infinity
    assert.throws(() => persist(row))
    assert.deepEqual(row.$original, original)
  })
  test('a rejected adapter attempt cannot leak pending metadata into a later scalar save', ({ assert }) => {
    const row = hydrated(allocation('1.00'))
    row.categories[0].baseAmount = 2.345
    stageFundingStorage(row, 'categories'); stageCategoryStorage(row)
    row.prepareForAdapter(row.$dirty) // Simulate preparation followed by an adapter/transaction failure.
    row.categories = globalThis.structuredClone(row.$original.categories)
    row.comment = 'later unrelated save'
    assert.deepEqual(persist(row), { comment: 'later unrelated save' })
    assert.equal(row.categories[0].baseAmount, 1)
  })
  test('changing a rule identity or mode does not reuse an unrelated historical leaf', ({ assert }) => {
    const row = hydrated(allocation('1.00'))
    row.categories[0].fundingCategories[0].percentage = true
    row.categories[0].fundingCategories[1].categoryId = 98
    const encoded = JSON.parse(persist(row).categories)[0]
    assert.equal(encoded.fundingCategories[0].amount, '1.00')
    assert.equal(encoded.fundingCategories[1].amount, '1.00')
    assert.equal(encoded.baseAmount, '1.00')
  })
  test('transfer validator decodes canonical money while retaining percentage precision and total constraints', async ({ assert }) => {
    const data = { date: '2026-10-01', type: 2, categories: [{ categoryId: 1, amount: '1.00', baseAmount: '1.00',
      fundingCategories: [rule(12.345, true), rule(87.655, true)] }] }
    // These individually round to 12.35 + 87.66, so the existing total must still reject.
    await assert.rejects(() => updateCategoryTransfer.validate(data))
    data.categories[0].fundingCategories = [rule(12.344, true), rule(87.656, true)]
    const validated = await updateCategoryTransfer.validate(data)
    assert.equal(validated.categories[0].baseAmount, 1)
    assert.equal(validated.categories[0].fundingCategories[0].amount, 12.344)
  })
  test('actual funding functions preserve fixed, percentage, mixed and residual behavior after roundtrip', ({ assert }) => {
    for (const [base, rules] of [[1, [rule(100, true)]], [10, [rule(2), rule(100, true)]],
      [0.01, [{ ...rule(50, true), categoryId: 98 }, rule(50, true)]], [-1, [rule(100, true)]]]) {
      const inputs = { 10: { baseAmount: base, fundingCategories: rules, includeFundingTransfers: false } }
      const before = calculateFunding(inputs, 99)
      const decoded = decodeFundingMetadata(encodeFundingMetadata(before))
      assert.deepEqual(calculateFunding({ 10: { ...decoded[0], includeFundingTransfers: false } }, 99), before)
      if (base === 0.01) {
        assert.throws(() => validateCategoryConservation(2, before, undefined, 99), 'Funding requires a Funding Pool allocation.')
        assert.throws(() => validateCategoryConservation(2, decoded, undefined, 99), 'Funding requires a Funding Pool allocation.')
      } else validateCategoryConservation(2, decoded, undefined, 99)
    }
  })
  test('deleted historical metadata stays readable without revalidation or write-on-read', ({ assert }) => {
    const row = hydrated(allocation('54.27'))
    row.deleted = true
    assert.equal(row.categories[0].baseAmount, 54.27)
    assert.deepEqual(persist(row), {})
  })
  test('SQL decimal extraction, Budget locks, ownership and transaction binding remain at existing boundaries', async ({ assert }) => {
    const source = await readFile('app/Controllers/Http/CategoriesController.ts', 'utf8')
    assert.include(source, '"baseAmount" decimal')
    assert.include(source, 'sum(coalesce(transCats."baseAmount", 0))')
    assert.include(source, 'forUpdate()'); assert.include(source, 'client: trx')
    assert.include(source, 'validateStoredCategoryConservation(transaction)')
    const raw = [rule('1.00')], row = new Sample()
    row.$isPersisted = true
    const decoded = consumeFundingStorage(raw, row)
    assert.deepEqual(prepareFundingStorage(decoded, row), raw)
  })
})

test('persisted funding readers reject numeric leaves in every migrated path', ({ assert }) => {
  for (const amount of [0, -0, 1, -1, 1.005]) {
    assert.throws(() => decodeFundingRules([rule(amount)]))
    assert.throws(() => decodeFundingRules([rule(amount, true)]))
    assert.throws(() => decodeFundingMetadata([{ categoryId: 1, baseAmount: amount }]))
    assert.throws(() => decodeFundingMetadata([{ categoryId: 1, fundingCategories: [rule(amount)] }]))
    assert.throws(() => hydrated(allocation(amount)))
    assert.throws(() => Category.$createFromAdapterResult({ id: 1, type: 'BILL', funding_categories: [rule(amount)] }))
  }
})
