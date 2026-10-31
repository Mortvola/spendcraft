import { test } from '@japa/runner'
import { monetaryAmountCents, encodeMonetaryAmount } from
  '../../app/services/categoryAmountCodec.ts'
import { BaseModel } from '@adonisjs/lucid/orm'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { encodeTaxAttributions, decodeTaxAttributions, validateSubmittedTaxAmounts } from
  '../../app/services/taxAmountCodec.ts'
import { bindResolvedTaxStorage, prepareTaxStorage, stageTaxStorage, finishTaxStorageSave,
  excludeTaxStorage, hasTaxStorage, isTaxStorageExcluded, enableTaxStorageWrite } from
    '../../app/services/taxStorageBinding.ts'
import { bindResolvedCategoryStorage, prepareCategoryStorage, stageCategoryStorage,
  finishCategoryStorageSave,
  hasCategoryStorage, excludeCategoryStorage, excluded as categoryExclusions } from
    '../../app/services/categoryStorageBinding.ts'
import { validateTransactionSplits } from '../../app/validation/transactionSplits.ts'
import { updateTransaction } from '../../app/validation/Validators/transaction.ts'
import {
  accountEligible, categoryEligible, categoryEffectDeltas, excludedCategoryEffectDeltas,
} from '../../app/services/transactionEligibility.ts'
import { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents } from
  '../../common/moneyCents.ts'
import { AccountType, CategoryType, TrackingType, TransactionType } from
  '../../common/ResponseTypes.ts'

class Sample extends BaseModel {}
Sample.boot()
for (const name of ['id', 'budgetId', 'type', 'version', 'comment', 'date', 'deleted']) Sample
  .$addColumn(name, {})
Sample.$addColumn('taxes', { prepare: (value, _key, row) => prepareTaxStorage(value, row),
  serialize: value => value === null || value === undefined ? value : encodeTaxAttributions(
    value) })
Sample.$addColumn('categories', { prepare: (value, _key, row) => prepareCategoryStorage(value,
  row) })
function hydrated(taxes, properties = {}) {
  const model = new Sample().merge({ id: 1, budgetId: 1, type: 5, version: 0, comment: 'old',
    date: DateTime.fromISO('2025-02-01'), deleted: false, categories: [{ categoryId: 1, amount:
      '10.00' }], taxes, ...properties })
  model.$isPersisted = true
  model.$hydrateOriginals()
  return model
}
const attribution = (amount, type = 'estimated_tax_payments') => ({ type, amount })
async function fn(path, name, context, method = false) {
  const ast = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true)
  let member
  function visit(node) {
    if ((method ? ts.isMethodDeclaration(node) : ts.isFunctionDeclaration(node)) && node.name
      ?.getText(ast) === name) member = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!member) throw new Error('Missing production method ' + name)
  const expression = method ? `async function(${member.parameters.map(parameter => parameter
    .getText(ast)).join(',')}) ${member.body.getText(ast)}`
    : member.getText(ast).replace(/^export\s+/, '')
  return runInNewContext(ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts
    .ScriptTarget.ES2022 } }).outputText, context)
}
async function productionFunctions(queryDb) {
  const globals = { hasCategoryStorage, categoryExclusions, bindResolvedTaxStorage,
    excludeTaxStorage, hasTaxStorage,
    isTaxStorageExcluded, stageTaxStorage, enableTaxStorageWrite, encodeTaxAttributions,
      validateSubmittedTaxAmounts, db: queryDb }
  const path = 'app/services/transactionTaxStorage.ts'
  const bindTaxStorage = await fn(path, 'bindTaxStorage', globals)
  const context = { ...globals, bindTaxStorage }
  return { bindTaxStorage, prepareTaxReplacement: await fn(path, 'prepareTaxReplacement', context),
    prepareTaxStorageSave: await fn(path, 'prepareTaxStorageSave', context) }
}

test.group('Tax decimal-string production codec and Lucid boundary (no database)', () => {
  test('approved per-value rounding').with([
    [12.34, '12.34'], [12.345, '12.35'], [-12.345, '-12.34'], [-1.005, '-1.00'], [0.1 + 0.2,
      '0.30'],
    [0, '0.00'], [-0, '0.00'], [0.005, '0.01'], [-0.005, '0.00'], [0.125, '0.13'], [-0.125,
      '-0.12'],
  ]).run(({ assert }, [value, stored]) => {
    assert.equal(encodeMonetaryAmount(value), stored)
    assert.equal(monetaryAmountCents(value), Math.round(value * 100) || 0)
  })
  test('invalid storage scalar types and syntax reject, never coerce to zero').with([
    undefined, null, true, false, {}, [], NaN, Infinity, -Infinity, '', ' ', '1.2', '1.005', '1e2',
      '01.00', '-0.00', 'bad',
    Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, '90071992547409.92',
  ]).run(({ assert }, value) => assert.throws(() => encodeMonetaryAmount(value)))
  test('new raw input rejects numeric and noncanonical amounts').with([1, 1.005, '1.005', '1e-2',
    '-.125', ' 1.25 ', undefined, null, true, false, {}, [], '', ' ', '0x10', '12abc', 'Infinity'])
    .run(({ assert }, amount) => assert.throws(() => validateSubmittedTaxAmounts([attribution(
      amount)])))
  test('canonical request strings are accepted').with(['1.00', '-0.12', '0.00', '0.30'])
    .run(({ assert }, amount) => assert.doesNotThrow(() => validateSubmittedTaxAmounts([attribution(
      amount)])))
  test('canonical decoding is numeric and leaves raw storage unchanged', ({ assert }) => {
    const original = [attribution('0.30'), { ...attribution('1.23'), metadata: { keep: 1 } },
      attribution('-2.00')]
    const before = globalThis.structuredClone(original)
    const decoded = decodeTaxAttributions(original)
    assert.deepEqual(decoded.map(entry => entry.amount), [0.3, 1.23, -2])
    assert.deepEqual(original, before)
    assert.deepEqual(encodeTaxAttributions(decoded), [attribution('0.30'), original[1], attribution(
      '-2.00')])
  })
  test('entry order, duplicates, type labels and metadata survive encoding without conservation', ({
    assert }) => {
    const values = [attribution(50000000000000), { ...attribution(50000000000000), extra: {
      amount: 1.005 } }, attribution(-3)]
    const result = encodeTaxAttributions(values)
    assert.deepEqual(result.map(entry => entry.type), values.map(entry => entry.type))
    assert.deepEqual(result.map(entry => entry.amount), ['50000000000000.00', '50000000000000.00',
      '-3.00'])
    assert.equal(result[1].extra.amount, 1.005)
    // Total would exceed safe cents; these independent attributions have no sum invariant.
    assert.deepEqual(encodeTaxAttributions([]), [])
  })
  test('malformed arrays/types and missing amounts reject').with([null, {}, [null], [[]], [{
    type: 1, amount: 1 }], [{ type: 'x' }]])
    .run(({ assert }, value) => assert.throws(() => encodeTaxAttributions(value)))
  test('read hydration exposes numbers without dirtying or rewriting either JSON column', ({
    assert }) => {
    const model = hydrated([attribution('1.23'), attribution('1.00')])
    bindResolvedCategoryStorage(model); bindResolvedTaxStorage(model)
    assert.isFalse(model.$isDirty)
    assert.deepEqual(model.serialize().taxes.map(entry => entry.amount), ['1.23', '1.00'])
    model.comment = 'metadata'
    stageTaxStorage(model); stageCategoryStorage(model)
    assert.deepEqual(model.prepareForAdapter(model.$dirty), { comment: 'metadata' })
    finishTaxStorageSave(model)
    assert.equal(model.taxes[1].amount, 1)
  })
  test('explicit nested replacement persists strings and returns rounded numeric API values', ({
    assert }) => {
    const model = hydrated([attribution('1.00')])
    bindResolvedCategoryStorage(model); bindResolvedTaxStorage(model)
    model.taxes[0].amount = -0.125
    stageTaxStorage(model); stageCategoryStorage(model)
    const payload = model.prepareForAdapter(model.$dirty)
    assert.deepEqual(JSON.parse(payload.taxes), [attribution('-0.12')])
    assert.notProperty(payload, 'categories')
    model.$hydrateOriginals(); finishTaxStorageSave(model)
    assert.deepEqual(model.serialize().taxes, [attribution('-0.12')])
    assert.isFalse(model.$isDirty)
  })
  test('null/missing arrays are preserved on unrelated saves').with([null, undefined])
    .run(({ assert }, taxes) => {
      const model = hydrated(taxes)
      bindResolvedTaxStorage(model)
      assert.strictEqual(model.taxes, taxes)
      model.comment = 'metadata'
      stageTaxStorage(model)
      assert.notProperty(model.prepareForAdapter(model.$dirty), 'taxes')
    })
  test('excluded model keeps previous numeric serialization and never normalizes', ({ assert }) => {
    const model = hydrated([attribution(1.005)])
    excludeTaxStorage(model)
    bindResolvedTaxStorage(model)
    model.taxes = [attribution(2.345)]
    stageTaxStorage(model)
    assert.deepEqual(JSON.parse(model.prepareForAdapter(model.$dirty).taxes), [attribution(2.345)])
    assert.isFalse(hasTaxStorage(model))
  })
  test('failed-save staging cannot leak into a later metadata-only save', async ({ assert }) => {
    const model = hydrated([attribution('1.00')])
    bindResolvedCategoryStorage(model); bindResolvedTaxStorage(model)
    model.taxes = [attribution(2.345)]
    stageTaxStorage(model)
    // A failed adapter write leaves originals unchanged. Caller discards replacement.
    model.taxes = [attribution(1)]
    model.comment = 'retry metadata'
    const functions = await productionFunctions({ from() { throw new Error('Unexpected query') } })
    await functions.prepareTaxStorageSave(model)
    finishTaxStorageSave(model)
    assert.deepEqual(model.taxes, [attribution(1)])
    assert.notProperty(model.prepareForAdapter(model.$dirty), 'taxes')
  })
  test('new active scoped write remains dirty until encoded, without changing Category state',
    async ({ assert }) => {
    const model = new Sample().merge({ budgetId: 1, type: 5, categories: [], taxes: [attribution(
      1.125)] })
    bindResolvedCategoryStorage(model)
    const functions = await productionFunctions({ from() { throw new Error('Unexpected query') } })
    await functions.prepareTaxStorageSave(model)
    assert.isTrue(Object.hasOwn(model.$dirty, 'taxes'))
    assert.deepEqual(JSON.parse(model.prepareForAdapter(model.$dirty).taxes), [attribution('1.13')])
  })
  test('all persisted Category types bind Tax storage without deprecated scope queries',
    async ({ assert }) => {
    const events = [], owner = new EventEmitter()
    const queries = { from(table) { events.push(table); return {
      if(test, callback) { if (test) callback(this); return this }, useTransaction(client) { assert
        .strictEqual(client, owner); return this },
      join() { return this }, whereIn() { return this }, where() { return this },
      async select() { return table === 'categories' ? [{ id: 3 }] : [{ transaction_id: 2, type:
        'loan' }] },
    } } }
    const functions = await productionFunctions(queries)
    const rows = [hydrated([attribution('1.00')], { id: 1, type: 1 }), hydrated([attribution(
      '1.00')], { id: 2 }),
      hydrated([attribution('1.00')], { id: 3, categories: [{ categoryId: 3, amount: 1 }] }),
        hydrated([], { id: 4 })]
    for (const row of rows) row.useTransaction(owner)
    await functions.bindTaxStorage(rows)
    assert.deepEqual(rows.map(row => hasTaxStorage(row)), [true, true, true, true])
    assert.deepEqual(events, [])
    await functions.bindTaxStorage(rows)
    assert.lengthOf(events, 0)
    assert.equal(rows[0].taxes[0].amount, 1)
  })
  test('new unscoped rows and independent transactions are not silently globally normalized',
    async ({ assert }) => {
    const functions = await productionFunctions({ from() { throw new Error('Unexpected query') } })
    const model = new Sample().merge({ budgetId: 1, taxes: [attribution(1.005)] })
    await functions.bindTaxStorage([model])
    assert.isFalse(hasTaxStorage(model))
    const a = hydrated([]).useTransaction(new EventEmitter()), b = hydrated([]).useTransaction(
      new EventEmitter())
    await assert.rejects(() => functions.bindTaxStorage([a, b]),
      'Tax storage requires one owning transaction')
  })
})

async function patchFixture(input, { rawInput = input, invalidOwner = false, lateFailure = false } =
  {}) {
  const events = []
  const owner = new EventEmitter()
  owner.commit = async () => { events.push('commit') }
  owner.rollback = async () => { events.push('rollback') }
  const model = hydrated([attribution('1.00')]).useTransaction(owner)
  bindResolvedCategoryStorage(model); bindResolvedTaxStorage(model)
  const database = { taxes: JSON.stringify([attribution('1.00')]), categories: JSON.stringify([{
    categoryId: 1, amount: '10.00' }]) }
  const functions = await productionFunctions({ from() { throw new Error(
    'Unexpected additional scope query') } })
  const account = { id: 2, balanceCents: parseMoneyCents(encodeMonetaryAmount(100)),
    type: AccountType.Depository, tracking: TrackingType
    .Transactions,
    startDate: DateTime.fromISO('2025-01-01'), async save() { throw new Error(
      'Tax-only Account write') } }
  function query(value) { return { where() { return this }, andWhere() { return this }, whereHas() {
    return this },
    async firstOrFail() { return value } } }
  const link = { amountCents: parseMoneyCents('10.00'), pending: false, related(
    ) { return { query: () => query(account) } } }
  model.related = name => name === 'accountTransaction' ? { query: () => query(link) } : {
    async create() { events.push('log'); if (lateFailure) throw new Error(
      'Injected late failure') } }
  model.load = async () => undefined
  model.save = async () => {
    if (model.$trx !== owner) throw new Error('Unbound save')
    await functions.prepareTaxStorageSave(model)
    stageCategoryStorage(model)
    const payload = model.prepareForAdapter(model.$dirty)
    if (payload.categories !== undefined) throw new Error('Tax-only Category rewrite')
    if (payload.taxes !== undefined) database.taxes = payload.taxes
    model.$hydrateOriginals(); finishTaxStorageSave(model); finishCategoryStorageSave(model)
    events.push('save'); return model
  }
  const budget = { id: 1, getUnassignedCategory: async () => ({ id: 99 }) }
  const context = { encodeMonetaryAmount, ...functions, excludeTaxStorage, hasCategoryStorage,
    excludeCategoryStorage,
    canonicalCategoryAllocations: () => { throw new Error('Unexpected Category replacement') },
    validateStoredCategoryConservation: async () => { throw new Error(
      'Invented tax conservation') },
    AccountType, CategoryType, TrackingType, TransactionType, Exception, accountEligible,
      categoryEligible, categoryEffectDeltas, excludedCategoryEffectDeltas,
    validateTransactionSplits,
    addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents,
    db: { transaction: async () => owner }, updateTransaction, transactionFields: {},
    getAccountTransactionChanges: (_old, _new, previous) => previous,
    getChanges: (_old, _new, previous) => previous,
    Transaction: { query({ client }) { if (client !== owner) throw new Error('Unbound Transaction');
      events.push('transaction.read'); if (invalidOwner) throw new Error('E_ROW_NOT_FOUND');
        return query(model) } },
    budgetCategories(_budget, { client }) { if (client !== owner) throw new Error(
      'Unbound Category');
      return query({ id: 1, type: CategoryType.Regular }) },
  }
  const handler = await fn('app/Controllers/Http/TransactionsController.ts', 'update', context,
    true)
  const call = () => handler({ auth: { user: { username: 'Test', useTransaction(client) { if (
    client !== owner) throw new Error('Unbound user') },
    related() { return { query() { return { forUpdate() { return { async firstOrFail() { events
      .push('budget.lock'); return budget } } } } } } } } },
    request: { params: () => ({ trxId: 1 }), input: () => rawInput,
      validateUsing: validator => validator.validate({ version: 0, ...(input === undefined ? {
        comment: 'metadata' } : { taxCategories: input }) }) },
    response: { status() { return this } }, logger: { error() { return undefined } } })
  return { call, model, database, account, link, events }
}

test.group('Actual tax PATCH controller with inert financial collaborators', () => {
  test('stores strings, returns numbers, holds Budget gate, and never touches other money', async ({
    assert }) => {
    const f = await patchFixture([attribution('1.00'), attribution('-0.12'), attribution('0.01'),
      attribution('0.00', '')])
    const beforeCategories = f.database.categories
    const response = await f.call()
    assert.deepEqual(JSON.parse(f.database.taxes).map(entry => entry.amount), ['1.00', '-0.12',
      '0.01'])
    assert.deepEqual(response.data.transaction.taxes.map(entry => entry.amount), ['1.00', '-0.12',
      '0.01'])
    assert.equal(f.database.categories, beforeCategories)
    assert.equal(Number(formatMoneyCents(f.account.balanceCents)), 100); assert.equal(
      f.link.amountCents, parseMoneyCents('10.00'))
    assert.isBelow(f.events.indexOf('budget.lock'), f.events.indexOf('transaction.read'))
    assert.deepEqual(f.events.slice(-3), ['save', 'log', 'commit'])
  })
  test('explicit empty replacement clears attribution', async ({ assert }) => {
    const f = await patchFixture([]); await f.call()
    assert.deepEqual(JSON.parse(f.database.taxes), [])
  })
  test('metadata-only PATCH leaves raw stored tax strings and Category JSON untouched', async ({
    assert }) => {
    const f = await patchFixture(undefined)
    const before = { ...f.database }
    await f.call()
    assert.deepEqual(f.database, before)
  })
  test('new invalid values reject before save or financial mutation').with([true, '', '0x10', Number
    .MAX_SAFE_INTEGER, Infinity, null])
    .run(async ({ assert }, value) => {
      const f = await patchFixture([attribution(value)])
      const before = { ...f.database }
      await assert.rejects(f.call)
      assert.deepEqual(f.database, before)
      assert.notInclude(f.events, 'save')
      assert.notInclude(f.events, 'commit')
    })
  test('ownership rejection occurs before tax replacement or persistence', async ({ assert }) => {
    const f = await patchFixture([attribution('1.00')], { invalidOwner: true })
    await assert.rejects(f.call)
    assert.notInclude(f.events, 'save')
    assert.include(f.events, 'rollback')
  })
  test('late error propagates through the existing rollback contract', async ({ assert }) => {
    const f = await patchFixture([attribution('2.00')], { lateFailure: true })
    await assert.rejects(f.call)
    assert.include(f.events, 'rollback')
    assert.include(f.events, 'log')
    assert.notInclude(f.events, 'commit')
    // The adapter is inert; real persistence rollback is prepared for PostgreSQL.
  })
})

test('stored Tax attributions reject numbers while Loan exclusions retain them', ({ assert }) => {
  for (const amount of [0, -0, 1, -1, 1.005]) {
    assert.throws(() => decodeTaxAttributions([attribution(amount)]))
    assert.throws(() => bindResolvedTaxStorage(hydrated([attribution(amount)])))
  }
})
