import { test } from '@japa/runner'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { argumentsFor, inspectAmount, inspectTransaction, newSummary, includeFinding, runAudit, PAGE_SQL } from '../../scripts/auditTransactionTaxPrecision.mjs'
import { updateTransaction } from '../../app/validation/Validators/transaction.ts'
import { discoverTarget } from '../../scripts/lib/historicalCategoryConversion.mjs'

const row = (entries, properties = {}) => ({ id: 1, type: 5, deleted: false, deprecated: false,
  taxes_text: JSON.stringify(entries), amount_tokens: JSON.stringify(Array.isArray(entries)
    ? entries.map(entry => entry && typeof entry === 'object' && 'amount' in entry ? JSON.stringify(entry.amount) : null) : []), ...properties })
const entry = amount => ({ type: 'estimated_tax_payments', amount })
const config = { host: 'localhost', port: 5432, database: 'spendcraft_staging', user: 'ubuntu' }
function fakeClient(rows = [], overrides = {}) {
  const calls = []
  return { calls, connection: { stream: { remoteAddress: '127.0.0.1', remotePort: 5432 } },
    async query(sql, parameters) {
      calls.push([sql, parameters])
      if (sql === PAGE_SQL) return { rows: rows.filter(row => row.id > parameters[0]).slice(0, parameters[1]) }
      if (sql.includes('current_database()')) return { rows: [{ database: config.database, username: config.user,
        port: 5432, server: '127.0.0.1/32', peer: '::ffff:127.0.0.1/128', oid: '123', system_identifier: '456', ...overrides }] }
      if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: overrides.read_only ?? 'on' }] }
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] }
      throw new Error('unexpected_sql')
    } }
}

test.group('Transaction tax precision audit (no database)', () => {
  test('reference rounding characterizes individual numeric values exactly')
    .with([
      [12.34, '12.34', '0'], [-12.34, '-12.34', '0'], [0, '0.00', '0'],
      [12.345, '12.35', '0.5'], [0.125, '0.13', '0.5'], [-0.125, '-0.12', '0.5'],
      [1.005, '1.00', '-0.5'], [-1.005, '-1.00', '0.5'],
      [0.30000000000000004, '0.30', '-0.000000000000004'],
      [0.29, '0.29', '0'], [-0.001, '0.00', '0.1'],
    ]).run(({ assert }, [value, proposed, difference]) => {
      const result = inspectAmount(value)
      assert.equal(result.status, 'valid')
      assert.equal(result.proposedAmount, proposed)
      assert.equal(result.differenceCents, difference)
      assert.equal(result.changed, difference !== '0')
    })
  test('strings are validated exactly, never silently Number-rounded')
    .with(['12.34', '-12.34', '0.00', '-0.00', '1.005', '1e-2', '+.50']).run(({ assert }, value) => {
      const result = inspectAmount(value)
      assert.equal(result.status, 'valid')
      assert.isNull(result.proposedAmount)
      assert.equal(result.fractionalCents, value === '1.005')
      assert.equal(result.canonicalString, ['12.34', '-12.34', '0.00'].includes(value))
    })
  test('binary multiply artifacts do not make exact stored cents fractional', ({ assert }) => {
    assert.notEqual(0.29 * 100, 29)
    assert.isFalse(inspectAmount(0.29, '0.29').fractionalCents)
    assert.isTrue(inspectAmount(0.1, '0.100000000000000001').sourceToNumberChanged)
    assert.equal(inspectAmount(0.1, '0.100000000000000001').differenceCents, '-0.0000000000000001')
  })
  test('source half ties and actual JavaScript multiplication ties are distinct', ({ assert }) => {
    const positive = inspectAmount(1.005)
    assert.isTrue(positive.sourceHalfTie)
    assert.isFalse(positive.javascriptHalfTie)
    assert.isTrue(inspectAmount(-0.125).javascriptHalfTie)
  })
  test('negative zero is explicitly characterized, including rounded zero', ({ assert }) => {
    const result = inspectAmount(-0)
    assert.isTrue(result.originalNegativeZero)
    assert.equal(result.originalToken, '-0')
    assert.equal(result.proposedAmount, '0.00')
    assert.isFalse(result.changed)
    assert.isTrue(inspectAmount(-0.001).roundedNegativeZero)
  })
  test('invalid and unsafe amounts remain errors rather than becoming zero')
    .with([undefined, null, true, {}, [], '1x', '', ' ', 'Infinity', '1,000', '0x10', NaN, Infinity,
      Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, '90071992547409.92', '1e1025'])
    .run(({ assert }, value) => assert.equal(inspectAmount(value).status, 'malformed'))
  test('current PATCH validator accepts fractional cents without changing them', async ({ assert }) => {
    for (const amount of [1.005, -0.125, '1.239']) {
      const result = await updateTransaction.validate({ version: 1, taxCategories: [entry(amount)] })
      assert.equal(result.taxCategories[0].amount, Number(amount))
    }
  })
  test('array order, duplicate tax types, signs and metadata are not mutated', ({ assert }) => {
    const input = row([entry(1.005), { ...entry('-2.00'), extra: { private: 'not emitted' } }, entry(3)])
    const before = JSON.parse(JSON.stringify(input))
    const result = inspectTransaction(input)
    assert.deepEqual(result.entries.map(item => item.index), [0, 1, 2])
    assert.deepEqual(result.entries.map(item => item.duplicate), [false, true, true])
    assert.isTrue(result.mixed)
    assert.deepEqual(input, before)
    assert.notInclude(JSON.stringify(result), 'not emitted')
  })
  test('empty, missing, SQL null, JSON null and unsupported shapes are distinct', ({ assert }) => {
    for (const [input, shape] of [[row([]), 'empty'], [row(null), 'json_null'],
      [row([], { taxes_text: undefined }), 'missing'], [row([], { taxes_text: null }), 'sql_null'],
      [row({ amount: 1 }), 'non_array'], [row([], { taxes_text: '{' }), 'invalid_json']]) {
      assert.equal(inspectTransaction(input).shape, shape)
    }
  })
  test('invalid types and missing amounts are separately visible', ({ assert }) => {
    const result = inspectTransaction(row([null, 3, {}, entry(null), { type: '', amount: 1 }, { amount: 'bad' }]))
    const summary = newSummary(); includeFinding(summary, result)
    assert.equal(summary.totalTaxEntries, 6)
    assert.equal(summary.malformedEntries, 6)
    assert.equal(summary.malformedAmountEntries, 5)
    assert.isTrue(result.unsupported)
  })
  test('deleted records retain all findings and do not receive an invented conservation rule', ({ assert }) => {
    const result = inspectTransaction(row([entry(123.456)], { deleted: true }))
    const summary = newSummary(); includeFinding(summary, result)
    assert.equal(summary.deletedTransactionsWithTaxAttribution, 1)
    assert.equal(summary.roundedNumericAmountsChanged, 1)
    assert.notProperty(result, 'conservation')
  })
  test('supported transaction types are all inspected; unknown types flagged')
    .with([0, 1, 2, 3, 4, 5, 99]).run(({ assert }, type) => {
      const result = inspectTransaction(row([entry(2)], { type }))
      assert.equal(result.entries.length, 1)
      assert.equal(result.unsupportedLifecycle, ![0, 2, 3, 4, 5].includes(type))
    })
  test('deprecated rows expose no monetary values', ({ assert }) => {
    const result = inspectTransaction(row([entry(123)], { deprecated: true }))
    const summary = newSummary(); includeFinding(summary, result)
    assert.deepEqual(result.entries, [])
    assert.equal(summary.excludedDeprecated, 1)
    assert.equal(summary.totalTaxEntries, 0)
  })
  test('summary counts Transactions independently of entries and representations', ({ assert }) => {
    const summary = newSummary()
    for (const input of [row([entry(0.125), entry('1.00'), entry('1.005')], { deleted: true }), row([]), row(null)]) {
      includeFinding(summary, inspectTransaction(input))
    }
    assert.equal(summary.transactionsExamined, 3)
    assert.equal(summary.transactionsWithTaxAttribution, 1)
    assert.equal(summary.totalTaxEntries, 3)
    assert.equal(summary.numericAmountEntries, 1)
    assert.equal(summary.stringAmountEntries, 2)
    assert.equal(summary.fractionalCentAmounts, 2)
    assert.equal(summary.roundedNumericAmountsChanged, 1)
    assert.equal(summary.mixedArrays, 1)
    assert.equal(summary.nullTaxData, 1)
  })
  test('token cardinality mismatches abort rather than inventing original values', ({ assert }) => {
    assert.throws(() => inspectTransaction(row([entry(1)], { amount_tokens: '[]' })), 'amount_token_count_mismatch')
  })
  test('CLI requires a named target, rejects execution flags, and defaults to read-only')
    .with([[], ['--execute'], ['--database', 'budget', '--execute'], ['--database', '../budget']])
    .run(({ assert }, args) => assert.throws(() => argumentsFor(args)))
  test('explicit database is an assertion, not an environment override', ({ assert }) => {
    assert.equal(argumentsFor(['--database', 'spendcraft', '--env', '/tmp/settings']).env, '/tmp/settings')
    assert.isTrue(argumentsFor(['--print-sql'])['print-sql'])
  })
  test('deterministic keyset scan is read-only and excludes credentials from identity', async ({ assert }) => {
    const rows = [row([entry(1)]), row([], { id: 2 }), row([entry('2.00')], { id: 3 })]
    const runs = []
    for (let i = 0; i < 2; i++) {
      const client = fakeClient(rows), details = []
      const summary = await runAudit(client, config, async finding => { details.push(JSON.stringify(finding)) }, { pageSize: 1 })
      assert.equal(summary.transactionsExamined, 3)
      assert.equal(client.calls[0][0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      assert.equal(client.calls.at(-1)[0], 'COMMIT')
      assert.isFalse(client.calls.some(([sql]) => /\b(UPDATE|INSERT|DELETE|TRUNCATE|ALTER|DROP|CREATE|FOR UPDATE)\b/i.test(sql)))
      assert.notProperty(summary.target, 'password')
      runs.push({ summary, details })
    }
    assert.deepEqual(runs[0], runs[1])
  })
  test('wrong database/user/port/server/peer rejects before financial SELECT')
    .with([{ database: 'budget' }, { username: 'other' }, { port: 5433 }, { server: '10.0.0.1' }, { peer: '10.0.0.2' }])
    .run(async ({ assert }, overrides) => {
      const client = fakeClient([], overrides)
      await assert.rejects(() => runAudit(client, config, async () => undefined))
      assert.isFalse(client.calls.some(([sql]) => sql === PAGE_SQL))
      assert.equal(client.calls.at(-1)[0], 'ROLLBACK')
    })
  test('execution TCP peer and transaction mode are independently verified', async ({ assert }) => {
    const wrongPeer = fakeClient(); wrongPeer.connection.stream.remoteAddress = '10.0.0.3'
    await assert.rejects(() => discoverTarget(wrongPeer, config))
    await assert.rejects(() => runAudit(fakeClient([], { read_only: 'off' }), config, async () => undefined))
  })
  test('partial output failure aborts with rollback rather than returning a complete summary', async ({ assert }) => {
    const client = fakeClient([row([entry(1)])])
    await assert.rejects(() => runAudit(client, config, async () => { throw new Error('disk_full') }))
    assert.equal(client.calls.at(-1)[0], 'ROLLBACK')
    assert.isFalse(client.calls.some(([sql]) => sql === 'COMMIT'))
  })
  test('regressing/duplicate IDs abort a scan', async ({ assert }) => {
    const client = fakeClient([row([]), row([])])
    await assert.rejects(() => runAudit(client, config, async () => undefined))
  })
  test('print SQL imports without reading env or connecting', ({ assert }) => {
    const result = spawnSync(process.execPath, [resolve('scripts/auditTransactionTaxPrecision.mjs'), '--print-sql'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), PAGE_SQL)
  })
  test('env mismatch creates unique evidence folders, prints paths first, and never exposes passwords', async ({ assert }) => {
    const folder = await mkdtemp(join(tmpdir(), 'tax-audit-test-'))
    try {
      const env = join(folder, 'settings.env')
      await writeFile(env, 'PG_HOST=localhost\nPG_PORT=5432\nPG_USER=ubuntu\nPG_PASSWORD=never-print-this\nPG_DB_NAME=spendcraft\n')
      const dirs = []
      for (let i = 0; i < 2; i++) {
        const result = spawnSync(process.execPath, [resolve('scripts/auditTransactionTaxPrecision.mjs'), '--database', 'budget', '--env', env, '--output-parent', folder], { encoding: 'utf8' })
        assert.equal(result.status, 1)
        const output = result.stdout.trim(); dirs.push(output)
        assert.isTrue(output.startsWith(folder + '/tax-precision-audit-'))
        assert.notInclude(result.stderr + result.stdout, 'never-print-this')
        const failure = JSON.parse(await readFile(join(output, 'failure.json'), 'utf8'))
        assert.equal(failure.code, 'env_database_mismatch')
        assert.notInclude(await readdir(output), 'summary.json')
      }
      assert.notEqual(dirs[0], dirs[1])
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
  test('audit query excludes deprecated storage and report eligibility assumptions', ({ assert }) => {
    assert.notInclude(PAGE_SQL, 'transaction_categories')
    assert.notInclude(PAGE_SQL, 't.type=1')
    assert.notMatch(PAGE_SQL, /\.balance|at\.amount|FOR UPDATE|pending|start_date/)
    assert.include(PAGE_SQL, 't.deleted')
  })
})

test('the audit and its local import dependencies are included in release metadata', async ({ assert }) => {
  const source = await readFile('adonisrc.ts', 'utf8')
  const patterns = [...source.matchAll(/pattern: '([^']+)'/g)].map(match => match[1])
  // Verify the new entry and the existing shared operator helpers it imports.
  for (const path of ['scripts/auditTransactionTaxPrecision.mjs', 'scripts/auditTransactionCategoryCents.mjs',
    'scripts/auditLegacyMoney.mjs', 'scripts/lib/historicalCategoryConversion.mjs']) {
    assert.include(patterns, path)
  }
})
