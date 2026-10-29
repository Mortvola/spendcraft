import { test } from '@japa/runner'
import { encodeMonetaryAmount } from '../../app/services/categoryAmountCodec.ts'
import { BaseModel, column, beforeSave, afterSave } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { decodeStatementIncome, serializeStatementIncome, serializeStatementIncomeResponse,
  encodeStatementIncome, statementIncomeFields,
  validateSubmittedStatementIncome } from '../../app/services/statementIncomeCodec.ts'
import { consumeStatementIncome, prepareStatementIncome, stageStatementIncomeSave,
  finishStatementIncomeSave,
  replaceStatementIncome } from '../../app/services/statementIncomeStorage.ts'
import { addStatement, updateStatement } from '../../app/validation/Validators/statement.ts'
import { TrackingType } from '../../common/ResponseTypes.ts'

const data = amount => Object.fromEntries(statementIncomeFields.map(f => [f, amount]))
async function sample() {
  const source = ts.createSourceFile('Statement.ts', await readFile('app/Models/Statement.ts',
    'utf8'), ts.ScriptTarget.Latest, true)
  const model = source.statements.find(ts.isClassDeclaration)
  const names = ['stageIncome', 'finishIncome', 'id', 'accountId', 'startDate', 'endDate',
    'startingBalance', 'endingBalance', 'data', 'serializeExtras']
  const context = { BaseModel, column, beforeSave, afterSave, DateTime,
    serializeStatementIncomeResponse, encodeMonetaryAmount,
    consumeStatementIncome, prepareStatementIncome, stageStatementIncomeSave,
      finishStatementIncomeSave }
  runInNewContext(ts.transpileModule(`class Sample extends BaseModel { ${model.members.filter(m =>
    names.includes(m.name?.getText(source))).map(m => m.getText(source)).join(
    '\n')} }\nglobalThis.Sample=Sample`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText, context)
  const Sample = context.Sample, writes = []
  Sample.boot()
  Sample.$adapter = {
    query() { return { client: { dialect: { dateTimeFormat: 'yyyy-MM-dd HH:mm:ss.SSSZZ' } } } },
    async insert(_row, values) { writes.push(values) }, async update(_row, values) { writes.push(
      values) },
  }
  const hydrated = raw => Sample.$createFromAdapterResult({ id: 1, account_id: 2, start_date:
    '2026-01-01', end_date: '2026-01-31', starting_balance: '100.00', ending_balance: '200.00',
    data: raw })
  return { Sample, writes, hydrated }
}

test.group('Statement income production codec and model boundary (no database)', () => {
  test('approved individual rounding').with([
    [12.34, '12.34'], [-12.34, '-12.34'], [12.345, '12.35'], [0.125, '0.13'], [-0.125, '-0.12'],
    [-1.005, '-1.00'], [0.1 + 0.2, '0.30'], [0, '0.00'], [-0, '0.00'], [0.005, '0.01'], [-0.005,
      '0.00'],
  ]).run(({ assert }, [amount, expected]) => {
    assert.equal(encodeMonetaryAmount(amount), expected)
    assert.deepEqual(encodeStatementIncome(data(amount)), data(expected))
  })
  test('malformed or unsafe scalars reject').with([
    undefined, null, true, false, {}, [], NaN, Infinity, -Infinity, '', ' ', '1.2', '1.005', '1e2',
      '-0.00', '01.00',
    'bad', Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, '90071992547409.92',
  ]).run(({ assert }, amount) => assert.throws(() => encodeMonetaryAmount(amount)))
  test('raw submitted unsupported coercions reject').with([true, false, '', ' ', {}, [], '0x10',
    'bad', Infinity, null, undefined])
    .run(({ assert }, amount) => assert.throws(() => validateSubmittedStatementIncome(data(
      amount))))
  test('canonical request strings decode to numeric controller values', async ({ assert }) => {
    for (const value of ['1.00', '-0.12', '0.00', '0.30']) {
      validateSubmittedStatementIncome(data(value))
      const validated = await updateStatement.validate({ startingBalance: value,
        endingBalance: value, data: data(value) })
      assert.strictEqual(validated.startingBalance, Number(value))
      assert.strictEqual(validated.endingBalance, Number(value))
      for (const field of statementIncomeFields) assert.strictEqual(validated.data[field], Number(
        value))
    }
  })
  test('monetary requests reject numbers and noncanonical or unsafe strings').with([
    0, -0, 1.005, true, false, {}, [], '', ' ', '1', '1.2', '1.005', '1e2', '+1.00',
    '01.00', '-0.00', ' 1.00', '1.00 ', 'NaN', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    for (const field of ['startingBalance', 'endingBalance']) {
      await assert.rejects(() => updateStatement.validate({ [field]: amount }))
      await assert.rejects(() => addStatement.validate({ startDate: '2026-01-01', endDate:
        '2026-01-31', startingBalance: '0.00', endingBalance: '0.00', [field]: amount }))
    }
    await assert.rejects(() => updateStatement.validate({ data: data(amount) }))
  })
  test('canonical storage reads preserve metadata without mutation', ({ assert }) => {
    const raw = { ...data('2.00'), dividends: '1.00', note: { amount: 1.005, ordered: [2, 1, 2] } }
    const before = globalThis.structuredClone(raw), decoded = decodeStatementIncome(raw)
    assert.deepEqual(decoded, { ...data(2), dividends: 1, note: raw.note })
    assert.deepEqual(raw, before)
    assert.deepEqual(encodeStatementIncome(decoded), { ...data('2.00'), dividends: '1.00', note: raw
      .note })
  })
  test('missing and null semantics are preserved without zero coercion', async ({ assert }) => {
    assert.isNull(decodeStatementIncome(null)); assert.isUndefined(decodeStatementIncome(undefined))
    assert.deepEqual(decodeStatementIncome({ note: 'kept', dividends: null }), { note: 'kept',
      dividends: null })
    assert.deepEqual(encodeStatementIncome({ note: 'kept' }), { note: 'kept' })
    assert.throws(() => encodeStatementIncome({ dividends: null }))
    assert.isUndefined((await updateStatement.validate({ data: null })).data)
    await assert.rejects(() => updateStatement.validate({ data: { dividends: 1 } }))
  })
  test('hydrate and unrelated save do not dirty or normalize stored income', async ({ assert }) => {
    const { hydrated, writes } = await sample()
    const raw = { ...data('1.00'), dividends: '1.00' }, row = hydrated(raw)
    assert.equal(row.data.dividends, 1); assert.isFalse(row.$isDirty)
    assert.deepEqual(row.serialize().data, { ...data('1.00'), dividends: '1.00' })
    await row.save(); assert.lengthOf(writes, 0)
    row.startDate = DateTime.fromISO('2026-01-02'); await row.save()
    assert.notProperty(writes[0], 'data'); assert.deepEqual(raw, { ...data('1.00'), dividends:
      '1.00' })
  })
  test('metadata-only JSON changes preserve exact historical amounts and optional leaves', async ({
    assert }) => {
    const { hydrated, writes } = await sample()
    const raw = { shortTermCapitalGains: '1.00', dividends: '2.00', taxableInterest: null, note:
      'old' }
    const row = hydrated(raw); row.data.note = 'new'; await row.save()
    assert.deepEqual(JSON.parse(writes[0].data), { ...raw, note: 'new' })
    assert.isFalse(row.$isDirty); assert.equal(row.data.shortTermCapitalGains, 1)
  })
  test(
    ("explicit replacement preserves metadata and " +
"persists strings even for unchanged numeric values"), async ({ assert }) => {
    const { hydrated, writes } = await sample(), row = hydrated({ ...data('1.00'), note: {
      keep: 3 } })
    replaceStatementIncome(row, data(1)); await row.save()
    assert.deepEqual(JSON.parse(writes[0].data), { ...data('1.00'), note: { keep: 3 } })
    assert.deepEqual(row.serialize().data, { ...data('1.00'), note: { keep: 3 } }); assert.isFalse(
      row.$isDirty)
    assert.notProperty(writes[0], 'starting_balance'); assert.notProperty(writes[0],
      'ending_balance')
    assert.equal(row.startingBalance, 100); assert.equal(row.endingBalance, 200)
  })
  test('new model writes and saved APIs use rounded amounts', async ({ assert }) => {
    const { Sample, writes } = await sample(), row = new Sample()
    row.merge({ id: 1, data: data(-0.125) }); await row.save()
    assert.deepEqual(JSON.parse(writes[0].data), data('-0.12'))
    assert.deepEqual(row.data, data(-0.12)); assert.deepEqual(row.serialize().data, data('-0.12'));
      assert.isFalse(row.$isDirty)
  })
  test('SQL-null data stays SQL null on insert and unchanged on metadata updates', async ({
    assert }) => {
    const { Sample, hydrated, writes } = await sample(), row = hydrated(null)
    row.startDate = DateTime.fromISO('2026-01-02'); await row.save(); assert.notProperty(writes[0],
      'data')
    const fresh = new Sample(); fresh.data = null; await fresh.save()
    assert.isNull(writes[1].data); assert.isNull(fresh.data)
  })
  test('failed adapter writes cannot apply stale pending normalization on a later metadata save',
    async ({ assert }) => {
    const { Sample, hydrated, writes } = await sample(), row = hydrated(data('1.00'))
    const update = Sample.$adapter.update
    Sample.$adapter.update = async () => { throw new Error('write failed') }
    replaceStatementIncome(row, data(2.345)); await assert.rejects(() => row.save(), 'write failed')
    row.data = data(1); row.startDate = DateTime.fromISO('2026-01-02'); Sample.$adapter.update =
      update
    await row.save(); assert.notProperty(writes[0], 'data'); assert.deepEqual(row.data, data(1))
  })
})

async function controllerMethod(name, context) {
  const path = 'app/Controllers/Http/AccountsController.ts', source = ts.createSourceFile(path,
    await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const model = source.statements.find(ts.isClassDeclaration), method = model.members.find(m => m
    .name?.getText(source) === name)
  return runInNewContext(ts.transpileModule(`(async function(${method.parameters.map(p => p.getText(
    source)).join(',')}) ${method.body.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
}
function chain(value) {
  return { where() { return this }, whereNull() { return this }, whereHas() { return this },
    andWhere() { return this },
    orderBy() { return this }, sum() { return this }, firstOrFail: async () => value,
    then(resolve) { return Promise.resolve(value).then(resolve) } }
}
async function lifecycle(input, options = {}) {
  const { Sample, hydrated, writes } = await sample(), events = [], owner = new EventEmitter()
  owner.commit = async () => { events.push('commit') }; owner.rollback = async () => { events.push(
    'rollback') }
  const statement = hydrated({ ...data('1.00'), note: 'preserve' }).useTransaction(owner)
  const account = { id: 2, balance: 200, tracking: options.tracking ?? TrackingType.Transactions,
    async save() { events.push('account.save') },
    related(name) { return name === 'statements' ? { create: async values => {
      events.push('create'); const row = new Sample().merge({ id: 1, accountId: 2, ...values })
        .useTransaction(owner); await row.save(); return row
    } } : { query: () => chain([]) } },
  }
  const user = { budgetId: 3, useTransaction(client) { if (client !== owner) throw Error(
    'wrong transaction') },
    related() { return { query: () => ({ forUpdate() { events.push('budget.lock'); return this },
      async firstOrFail() { options.onWait?.(); if (options.wait) await options.wait; events.push(
        'budget.acquired'); return {} },
    }) } },
  }
  const context = { encodeMonetaryAmount, TrackingType, addStatement, updateStatement,
    validateSubmittedStatementIncome, encodeStatementIncome, replaceStatementIncome,
    db: { transaction: async () => owner }, budgetAccounts(budget, { client }) {
      if (budget !== 3 || client !== owner || !events.includes('budget.acquired')) throw Error(
        'bad account binding')
      return chain(account)
    }, budgetStatements(budget, { client }) {
      if (budget !== 3 || client !== owner || !events.includes('budget.acquired')) throw Error(
        'bad statement binding')
      events.push('statement.read'); if (options.foreign) throw Error('not found'); return chain(
        statement)
    }, Statement: { query({ client }) { if (client !== owner) throw Error(
      'wrong balance transaction'); return chain({ endingBalance: 200 }) } },
    AccountTransaction: { query({ client }) { if (client !== owner) throw Error(
      'wrong aggregate transaction'); if (options.lateFailure) throw Error('late failure');
      return chain([{ $extras: { sum: 0 } }]) } },
  }
  const method = await controllerMethod(options.create ? 'addStatement' : 'updateStatement',
    context)
  const operation = method({ request: { params: () => ({ statementId: 1, acctId: 2 }), input: () =>
    input.data,
    validateUsing: validator => validator.validate(input) }, auth: { user }, logger: { error: () =>
      undefined } })
  return { operation, events, statement, writes, account }
}

test.group('Statement income production controllers (no database)', () => {
  test('real CREATE accepts and returns canonical strings and unchanged supplied balances', async ({
    assert }) => {
    const f = await lifecycle({ startDate: '2026-01-01', endDate: '2026-01-31', startingBalance:
      '100.00', endingBalance: '200.00', data: data('12.35') }, { create: true })
    const response = await f.operation
    assert.deepEqual(JSON.parse(f.writes[0].data), data('12.35')); assert.deepEqual(response.data,
      data('12.35'))
    assert.equal(response.startingBalance, '100.00'); assert.equal(response.endingBalance, '200.00')
    assert.notInclude(f.events, 'account.save'); assert.equal(f.events.at(-1), 'commit')
  })
  test('real data PATCH preserves financial balances and unrelated JSON under Budget transaction')
    .with([TrackingType.Transactions, TrackingType.Balances])
    .run(async ({ assert }, tracking) => {
      const f = await lifecycle({ data: data('-0.12') }, { tracking }), response = await f.operation
      assert.deepEqual(JSON.parse(f.writes[0].data), { ...data('-0.12'), note: 'preserve' })
      assert.deepEqual(response.data, data('-0.12')); assert.equal(f.account.balance, 200)
      assert.notProperty(f.writes[0], 'starting_balance'); assert.notProperty(f.writes[0],
        'ending_balance')
      assert.isTrue(f.events.indexOf('budget.acquired') < f.events.indexOf('statement.read'))
      assert.equal(f.events.at(-1), 'commit')
    })
  test('metadata PATCH never persists income and omitted/null requests preserve original data')
    .with([{}, { data: null }])
    .run(async ({ assert }, input) => {
      const f = await lifecycle({ ...input, startDate: '2026-01-02' }); await f.operation
      assert.notProperty(f.writes[0], 'data')
    })
  test('rejected values cause no adapter or balance writes').with([true, 'bad', Infinity, Number
    .MAX_SAFE_INTEGER])
    .run(async ({ assert }, amount) => {
      const f = await lifecycle({ data: data(amount) }); await assert.rejects(() => f.operation)
      assert.lengthOf(f.writes, 0); assert.notInclude(f.events, 'account.save')
    })
  test('foreign-Budget rejection and post-save errors roll back rather than commit').with([{
    foreign: true }, { lateFailure: true }])
    .run(async ({ assert }, options) => {
      const f = await lifecycle({ data: data('2.00') }, options); await assert.rejects(() => f
        .operation)
      assert.equal(f.events.at(-1), 'rollback'); assert.notInclude(f.events, 'commit')
    })
  test('waiting PATCH reads committed metadata only after Budget admission', async ({ assert }) => {
    let release, entered
    const gate = new Promise(resolve => { release = resolve }), waiting = new Promise(resolve => {
      entered = resolve })
    const f = await lifecycle({ data: data('2.35') }, { wait: gate, onWait: entered })
    await waiting
    assert.notInclude(f.events, 'statement.read'); assert.lengthOf(f.writes, 0)
    f.statement.data.note = 'committed while waiting'; f.statement.$hydrateOriginals()
    release(); await f.operation
    assert.equal(JSON.parse(f.writes[0].data).note, 'committed while waiting')
    assert.isTrue(f.events.indexOf('budget.acquired') < f.events.indexOf('statement.read'))
  })
  test('report SQL retains existing extraction, real aggregation and date grouping', async ({
    assert }) => {
    const source = await readFile('app/Controllers/Http/TaxesController.ts', 'utf8')
    for (const field of statementIncomeFields) assert.include(source, `(data->>'${field}')::real`)
    assert.include(source, "groupByRaw('EXTRACT(MONTH from end_date)')")
    assert.include(source, ".whereBetween('startDate'")
    assert.include(source, ".whereNotIn('subtype', ['401k', 'Roth 401k', 'Roth', 'ira'])")
  })
})

test('Statement storage decoding and numeric serialization are separate boundaries', async ({
  assert }) => {
  const { hydrated, Sample } = await sample()
  for (const amount of [0, -0, 1, -1, 1.005]) {
    assert.throws(() => decodeStatementIncome(data(amount)))
    assert.throws(() => hydrated(data(amount)))
    assert.deepEqual(serializeStatementIncome(data(amount)), data(amount))
    const row = new Sample().merge({ data: data(amount) })
    assert.deepEqual(row.serialize().data, encodeStatementIncome(data(amount)))
  }
  assert.throws(() => serializeStatementIncome(data('1.00')))
})


test(
  'Statement list serialization emits only canonical monetary strings without changing the model',
  async ({ assert }) => {
  const { hydrated } = await sample()
  const row = hydrated({ ...data('0.30'), note: { amount: 1.005 }, dividends: null })
  row.$extras.credits = '0.30'
  row.$extras.debits = '-0.12'
  const before = globalThis.structuredClone(row.$attributes)
  const account = { related: () => ({ query: () => ({ withAggregate() { return this }, then(
    resolve) { return Promise.resolve([row]).then(resolve) } }) }) }
  const get = await controllerMethod('getStatements', { budgetAccounts: () => chain(account) })
  const rows = await get({ request: { params: () => ({ acctId: 2 }) }, auth: { user: {
    budgetId: 3 } } })
  const [response] = JSON.parse(JSON.stringify(rows))
  assert.strictEqual(response.startingBalance, '100.00')
  assert.strictEqual(response.endingBalance, '200.00')
  assert.strictEqual(response.credits, '0.30')
  assert.strictEqual(response.debits, '-0.12')
  assert.deepEqual(response.data, { ...data('0.30'), note: { amount: 1.005 }, dividends: null })
  assert.deepEqual(row.$attributes, before)
  assert.isFalse(row.$isDirty)
})

test('Statement response encoding preserves optional income and uses approved rounding', ({
  assert }) => {
  for (const [amount, expected] of [[0, '0.00'], [-0, '0.00'], [0.125, '0.13'], [-0.125, '-0.12'], [
    1.005, '1.00'], [0.1 + 0.2, '0.30']]) {
    assert.deepEqual(serializeStatementIncomeResponse(data(amount)), data(expected))
  }
  const original = { dividends: null, note: { amount: 1.005 } }
  assert.deepEqual(serializeStatementIncomeResponse(original), original)
  assert.isNull(serializeStatementIncomeResponse(null))
  assert.isUndefined(serializeStatementIncomeResponse(undefined))
})
