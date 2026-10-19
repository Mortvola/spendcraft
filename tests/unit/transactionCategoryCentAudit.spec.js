import { test } from '@japa/runner'
import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditTransaction, roundAmount, decimalTextCents, checkedAdd, newSummary,
  countResult, PAGE_SQL, runAudit, failureInfo, configuration as envConfiguration, createOutputDirectory } from '../../scripts/auditTransactionCategoryCents.mjs'
import { configuration, VERIFY_SQL, MODE_SQL } from '../../scripts/auditLegacyMoney.mjs'

const allocation = (amount, categoryId = 10) => ({ categoryId, amount })
const ordinary = (amounts, amount = '0.30') => ({ id: 1, type: 5, deleted: false, deprecated: false,
  categories: amounts.map((value) => allocation(value)),
  links: [{ amount, scoped: true, tracking: 'Transactions', pending: false }] })

test.group('Transaction Category cent audit — pure conversion and conservation', () => {
  test('approved signed rounding and formatting').with([
    [12.34, 1234, '12.34'], [12.345, 1235, '12.35'], [-12.345, -1234, '-12.34'],
    [0.005, 1, '0.01'], [-0.005, 0, '0.00'], [-1.005, -100, '-1.00'],
    [1.005, 100, '1.00'], [0.1 + 0.2, 30, '0.30'], [0, 0, '0.00'], [-0, 0, '0.00'],
    ['12.34', 1234, '12.34'], ['1e-2', 1, '0.01'],
  ]).run(({ assert }, [value, cents, formatted]) => {
    const result = roundAmount(value)
    assert.equal(result.cents, cents); assert.equal(result.amountString, formatted)
    assert.isFalse(Object.is(result.cents, -0)); assert.strictEqual(result.original, value)
  })
  test('invalid values never silently become zero').with([
    undefined, null, '', ' ', '12 dollars', '1,234', true, {}, [], NaN, Infinity, -Infinity,
    'Infinity', 'NaN', '1e999', Number.MAX_VALUE, Number.MAX_SAFE_INTEGER,
  ]).run(({ assert }, value) => { assert.throws(() => roundAmount(value)) })
  test('checked accumulation rejects overflow even if later operands cancel', ({ assert }) => {
    assert.throws(() => checkedAdd(Number.MAX_SAFE_INTEGER, 1), 'unsafe_cent_accumulation')
    assert.throws(() => checkedAdd(-Number.MAX_SAFE_INTEGER, -1), 'unsafe_cent_accumulation')
    const row = ordinary([45035996273704.95, 45035996273704.95, 1, -1])
    assert.equal(auditTransaction(row).status, 'malformed')
  })
  test('scale-two decimal text is parsed exactly and validated', ({ assert }) => {
    assert.equal(decimalTextCents('-1.01'), -101)
    assert.equal(decimalTextCents('9999999999.99'), 999999999999)
    assert.equal(decimalTextCents('-0.00'), 0)
    for (const value of ['1.005', '', ' 1.00', '1e2', '90071992547409.92', null]) {
      assert.throws(() => decimalTextCents(value))
    }
  })
  test('large safe cents do not necessarily format back to the same cent', ({ assert }) => {
    const amount = Number('90071992547405.12')
    const rounded = roundAmount(amount)
    assert.isTrue(Number.isSafeInteger(rounded.cents))
    assert.isFalse(rounded.encodingMatchesCents)
    assert.equal(auditTransaction(ordinary([amount])).reason, 'formatted_dollars_do_not_encode_rounded_cents')
  })
  test('account-linked signs, lifecycle and nominal eligibility do not alter comparison')
    .with([0, 4, 5].flatMap((type) => [false, true].flatMap((deleted) => [false, true].map((pending) => ({ type, deleted, pending })))))
    .run(({ assert }, { type, deleted, pending }) => {
      const row = ordinary([-0.1, -0.2], '-0.30')
      row.type = type; row.deleted = deleted; row.links[0].pending = pending
      row.date = '2020-01-01'; row.links[0].startDate = '2025-01-01'
      assert.equal(auditTransaction(row).status, 'pass')
    })
  test('duplicates and Unassigned remain individual allocations', ({ assert }) => {
    const row = ordinary([0.1, 0.2])
    const before = JSON.stringify(row)
    const result = auditTransaction(row)
    assert.equal(result.status, 'pass'); assert.deepEqual(result.categoryCents, [10, 20])
    assert.equal(JSON.stringify(row), before)
  })
  test('ordinary mismatch includes exact difference and original values', ({ assert }) => {
    const result = auditTransaction(ordinary([0.1], '0.30'))
    assert.equal(result.status, 'fail'); assert.equal(result.categorySumCents, 10)
    assert.equal(result.expectedCents, 30); assert.equal(result.differenceCents, -20)
    assert.equal(result.originalCategoryAmounts[0].value, 0.1)
  })
  test('negative half-cent policy is not old absolute-value validation', ({ assert }) => {
    const result = auditTransaction(ordinary([-0.005], '-0.01'))
    assert.equal(result.status, 'fail'); assert.equal(result.differenceCents, 1)
  })
  test('round every allocation before summation', ({ assert }) => {
    const result = auditTransaction(ordinary([0.004, 0.004], '0.01'))
    assert.equal(result.categorySumCents, 0); assert.equal(result.status, 'fail')
    assert.equal(Math.round((0.004 + 0.004) * 100), 1)
    const inverse = auditTransaction(ordinary([0.005, 0.005], '0.01'))
    assert.equal(inverse.categorySumCents, 2); assert.equal(inverse.status, 'fail')
  })
  test('funding compares signed net allocations to the opposite Pool sum', ({ assert }) => {
    const row = { ...ordinary([]), type: 2, links: [], poolIds: [99], categories: [
      allocation(60), allocation(-10), allocation(-20, 99), allocation(-30, 99),
    ] }
    row.categories[0].baseAmount = 999
    const before = JSON.stringify(row)
    let result = auditTransaction(row)
    assert.equal(result.status, 'pass'); assert.equal(result.poolAllocationCents, -5000)
    assert.equal(result.nonPoolSumCents, 5000); assert.equal(result.expectedCents, 5000)
    assert.equal(JSON.stringify(row), before)
    row.categories[0].amount = 61
    result = auditTransaction(row)
    assert.equal(result.status, 'fail'); assert.equal(result.differenceCents, 100)
    row.categories.forEach((entry) => { entry.amount *= -1 })
    assert.equal(auditTransaction(row).differenceCents, -100)
  })
  test('rebalance zero sum and signed remainder', ({ assert }) => {
    const row = { ...ordinary([0.1, 0.2, -0.3]), type: 3, links: [] }
    assert.equal(auditTransaction(row).status, 'pass')
    row.categories.push(allocation(-0.01))
    const result = auditTransaction(row)
    assert.equal(result.status, 'fail'); assert.equal(result.signedRemainderCents, -1)
  })
  test('empty ordinary arrays are audited without synthesizing remainder', ({ assert }) => {
    assert.equal(auditTransaction(ordinary([], '0.00')).status, 'pass')
    assert.equal(auditTransaction(ordinary([], '0.01')).status, 'fail')
    assert.equal(auditTransaction({ ...ordinary([]), type: 3, links: [] }).status, 'unsupported')
  })
  test('malformed allocation shapes remain separate from conservation failures')
    .with([null, {}, [null], [{}], [{ categoryId: 10 }], [allocation(null)], [allocation('bad')], [allocation(1, -1)]])
    .run(({ assert }, categories) => { assert.equal(auditTransaction({ ...ordinary([]), categories }).status, 'malformed') })
  test('unsupported link, lifecycle and Pool shapes are not false passes').with([
    { links: [] }, { links: [{}, {}] }, { links: [{ scoped: false }] },
    { links: [{ scoped: true, tracking: 'Balances' }] }, { type: 1 }, { type: 99 },
    { type: 2, links: [], poolIds: [] }, { type: 2, links: [], poolIds: [99, 100] },
    { type: 2, links: [], poolIds: [99] }, { type: 3 },
  ]).run(({ assert }, patch) => { assert.equal(auditTransaction({ ...ordinary([0.3]), ...patch }).status, 'unsupported') })
  test('opening allocations use the linked movement, including Pool allocations').with([
    [50, [20, 30], 'pass', 0],
    [-50, [-20, -30], 'pass', 0],
    [50, [20, 20], 'fail', -1000],
    [0, [], 'pass', 0],
    [50, [], 'fail', -5000],
  ]).run(({ assert }, [amount, splits, status, difference]) => {
    const row = { ...ordinary(splits, amount.toFixed(2)), type: 4, poolIds: [10] }
    const result = auditTransaction(row)
    assert.equal(result.status, status)
    assert.equal(result.expectedCents, amount * 100)
    assert.equal(result.differenceCents, difference)
    assert.lengthOf(result.originalCategoryAmounts, splits.length)
    const summary = newSummary()
    countResult(summary, result)
    assert.equal(summary.opening, 1)
    assert.equal(summary.ordinary, 0)
    assert.equal(summary.byType['4'][status], 1)
  })
  test('opening requires one scoped supported Account link').with([
    [], [{}, {}], [{ amount: '0.30', scoped: false, tracking: 'Transactions' }],
  ]).run(({ assert }, links) => {
    assert.equal(auditTransaction({ ...ordinary([0.3]), type: 4, links }).status, 'unsupported')
  })
  test('deprecated exclusion happens before analyzing amounts', ({ assert }) => {
    assert.equal(auditTransaction({ ...ordinary([null]), deprecated: true }).status, 'deprecated')
  })
  test('summary counts have disjoint outcome buckets and per-type totals', ({ assert }) => {
    const summary = newSummary()
    for (const row of [ordinary([0.3]), ordinary([0.2]), ordinary([null]), { ...ordinary([]), links: [] },
      { ...ordinary([]), deprecated: true }, ordinary([0.1 + 0.2])]) countResult(summary, auditTransaction(row))
    assert.equal(summary.total, 6); assert.equal(summary.pass, 2); assert.equal(summary.fail, 1)
    assert.equal(summary.malformed, 1); assert.equal(summary.unsupported, 1); assert.equal(summary.deprecated, 1)
    assert.equal(summary.amountsChanged, 1); assert.equal(summary.byType['5'].total, 6)
  })
})

function fake(mode = 'success') {
  const events = [], findings = []
  const row = { id: 1, type: 5, categories_text: '[{"categoryId":10,"amount":0.3}]',
    links_text: '[{"amount":"0.30","scoped":true,"tracking":"Transactions","pending":false}]',
    pool_ids: '[]', amount_tokens: '["0.3"]' }
  let pages = 0
  const client = { on() { return this }, async connect() { events.push('connect') }, async end() {
    events.push('end')
    if (mode === 'cleanup-errors') throw Object.assign(new Error('private cleanup text'), { code: 'ECONNRESET' })
  },
    async query(sql, args) {
      events.push(sql)
      if (sql === VERIFY_SQL) return { rows: [{ database: mode === 'wrong-target' ? 'wrong' : 'offline', port: 5432, default_read_only: 'on' }] }
      if (sql === MODE_SQL) return { rows: [{ read_only: mode === 'writable' ? 'off' : 'on', isolation: 'repeatable read' }] }
      if (sql === PAGE_SQL) {
        if (mode === 'query-error' || mode === 'cleanup-errors') {
          throw Object.assign(new Error('private driver detail'), { code: '42703', position: '193' })
        }
        if (pages++ === 0) { if (args[0] !== '0') throw new Error('Bad initial key'); return { rows: [row] } }
        if (args[0] !== '1') throw new Error('Bad next key')
        return { rows: [] }
      }
      if (sql === 'ROLLBACK' && mode === 'cleanup-errors') throw Object.assign(new Error('private rollback text'), { code: '08006' })
      return { rows: [] }
    } }
  const config = configuration({ SPENDCRAFT_AUDIT_DATABASE: 'offline', SPENDCRAFT_AUDIT_SOCKET_DIR: '/tmp/offline' })
  return { events, findings, run: () => runAudit(config, (options) => {
    if (!options.options.includes('default_transaction_read_only=on')) throw new Error('Unsafe connection')
    return client
  }, async (finding) => { findings.push(finding) }) }
}
test.group('Transaction Category audit — offline safety and bounded paging', () => {
  test('default output directories are unique, private and created automatically', async ({ assert }) => {
    const directories = []
    try {
      directories.push(await createOutputDirectory(), await createOutputDirectory())
      assert.notEqual(directories[0], directories[1])
      for (const directory of directories) {
        assert.equal(directory.startsWith(join(process.cwd(), 'category-cent-audit-')), true)
        const info = await stat(directory)
        assert.isTrue(info.isDirectory())
        assert.equal(info.mode & 0o777, 0o700)
      }
    } finally {
      await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
    }
  })
  test('connection configuration reads only the selected env file', async ({ assert }) => {
    const dir = await mkdtemp(join(tmpdir(), 'category-cent-env-'))
    try {
      const file = join(dir, '.env')
      await writeFile(file, 'PG_HOST=localhost\nPG_PORT=5433\nPG_USER=audit\nPG_PASSWORD="secret#quoted"\nPG_DB_NAME=spendcraft_sandbox\n')
      const config = await envConfiguration(file, { PG_HOST: 'wrong', PG_PASSWORD: 'wrong' }, 'spendcraft_sandbox')
      assert.equal(config.host, 'localhost')
      assert.equal(config.port, 5433)
      assert.equal(config.database, 'spendcraft_sandbox')
      assert.equal(config.user, 'audit')
      assert.equal(config.password, 'secret#quoted')
      await assert.rejects(() => envConfiguration(file, {}, 'other'), 'env_database_mismatch')
      for (const contents of [
        'PG_HOST=localhost',
        'PG_HOST=localhost\nPG_PORT=bad\nPG_USER=audit\nPG_PASSWORD=\nPG_DB_NAME=offline',
      ]) {
        await writeFile(file, contents)
        await assert.rejects(() => envConfiguration(file), 'invalid_env_connection')
      }
      await assert.rejects(() => envConfiguration(join(dir, 'missing.env')))
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  test('codeless pg connection errors have safe fixed diagnostics').with([
    ['SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string', 'SASL_PASSWORD_MISSING'],
    ['SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string', 'SASL_PASSWORD_INVALID_TYPE'],
    ['timeout expired', 'CONNECT_TIMEOUT'], ['Connection terminated', 'CONNECTION_TERMINATED'],
    ['Connection terminated unexpectedly', 'CONNECTION_TERMINATED'],
    ['SASL: SCRAM-SERVER-FINAL-MESSAGE: server returned error: "private server text"', 'SASL_PROTOCOL_ERROR'],
  ]).run(({ assert }, [message, code]) => {
    const diagnostic = failureInfo(new Error(message), 'connect')
    assert.equal(diagnostic.code, code)
    assert.notInclude(JSON.stringify(diagnostic), message)
    assert.notInclude(JSON.stringify(diagnostic), 'private')
  })
  test('safe diagnostics identify phase and code without raw error content', ({ assert }) => {
    const error = Object.assign(new Error('password=private and transaction data'), {
      code: '42703', position: '193', detail: 'private values', query: 'private SQL',
    })
    assert.deepEqual(failureInfo(error, 'page_query', 100), {
      phase: 'page_query', code: '42703', examined: 100, sqlPosition: '193',
    })
    assert.equal(failureInfo(new Error('private unknown error'), 'connect').code, 'unclassified_error')
  })
  test('query diagnostics survive rollback and connection cleanup failures', async ({ assert }) => {
    const f = fake('cleanup-errors')
    let observed
    try { await f.run() } catch (error) { observed = error }
    assert.equal(observed.auditFailure.phase, 'page_query')
    assert.equal(observed.auditFailure.code, '42703')
    assert.deepEqual(observed.auditFailure.cleanupFailures.map((error) => error.phase), ['rollback', 'close_connection'])
    assert.notInclude(JSON.stringify(observed.auditFailure), 'private')
    assert.equal(f.events.at(-1), 'end')
  })
  test('existing output fails before database connection and explains EEXIST', async ({ assert }) => {
    const dir = await mkdtemp(join(tmpdir(), 'category-cent-diagnostic-'))
    try {
      await writeFile(join(dir, 'transactions.jsonl'), 'existing output')
      await writeFile(join(dir, '.env'), 'PG_HOST=/tmp/nonexistent-audit-socket\nPG_PORT=5432\nPG_USER=offline\nPG_PASSWORD=\nPG_DB_NAME=offline\n')
      const result = spawnSync(process.execPath, ['scripts/auditTransactionCategoryCents.mjs', '--database', 'offline', '--env-file', join(dir, '.env'), '--execute'], {
        encoding: 'utf8', env: { ...process.env, SPENDCRAFT_AUDIT_OUTPUT_DIR: dir, SPENDCRAFT_AUDIT_SOCKET_DIR: '/tmp/nonexistent-audit-socket' },
      })
      assert.equal(result.status, 3)
      assert.include(result.stderr, '"phase":"create_details_file"')
      assert.include(result.stderr, '"code":"EEXIST"')
      assert.include(result.stderr, 'fresh output directory')
      assert.include(result.stdout, `Audit output directory: ${dir}`)
      assert.notInclude(result.stderr, 'password')
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  test('requires execution consent; print-sql is offline and read-only', ({ assert }) => {
    const result = spawnSync(process.execPath, ['scripts/auditTransactionCategoryCents.mjs', '--database', 'offline'], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    const sql = execFileSync(process.execPath, ['scripts/auditTransactionCategoryCents.mjs', '--print-sql'], { encoding: 'utf8' })
    assert.equal(sql.trim(), PAGE_SQL)
    assert.notMatch(sql, /\b(?:insert|update|delete|truncate|alter|drop|create|call)\b/i)
    assert.notInclude(sql, 'transaction_categories')
  })
  test('verified read-only repeatable snapshot streams keyset pages and closes', async ({ assert }) => {
    const f = fake()
    const report = await f.run()
    assert.equal(report.summary.pass, 1); assert.equal(f.findings[0].originalCategoryAmounts[0].storedToken, '0.3')
    assert.isAbove(f.events.indexOf(PAGE_SQL), f.events.indexOf(MODE_SQL))
    assert.deepEqual(f.events.slice(-2), ['COMMIT', 'end'])
  })
  test('fail closed and roll back without exposing a complete report')
    .with(['wrong-target', 'writable', 'query-error']).run(async ({ assert }, mode) => {
      const f = fake(mode)
      await assert.rejects(f.run)
      assert.equal(f.events.at(-1), 'end'); assert.notInclude(f.events, 'COMMIT')
      if (mode === 'wrong-target') assert.notInclude(f.events, PAGE_SQL)
      else assert.include(f.events, 'ROLLBACK')
    })
})
