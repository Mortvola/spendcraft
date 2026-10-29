import { test } from '@japa/runner'
import process from 'node:process'
import { EventEmitter } from 'node:events'
import { execFileSync, spawnSync } from 'node:child_process'
import { QUERIES } from '../../scripts/auditSplitTotals.mjs'
import { collect, configuration, VERIFY_SQL, MODE_SQL, SCHEMA_SQL } from
  '../../scripts/auditLegacyMoney.mjs'

function fixture(mode = 'success') {
  const events = []
  const connection = new EventEmitter()
  const counts = [{ deleted: false, pending: false, ordinary_transactions: '10',
    exact_decimal_mismatches: '2' }]
  const config = configuration({ SPENDCRAFT_AUDIT_DATABASE: 'offline_test', SPENDCRAFT_AUDIT_USER:
    'offline',
    SPENDCRAFT_AUDIT_SOCKET_DIR: '/tmp/offline-only' })
  const client = {
    connection, on: () => undefined,
    async connect() { events.push('fake-connect') },
    async end() { events.push('end') },
    async query(sql, bindings) {
      events.push(sql)
      connection.emit('readyForQuery', { status: 'I' })
      if (sql === VERIFY_SQL) return { rows: [{ database: mode === 'wrong-target' ? 'wrong' :
        'offline_test',
        port: 5432, default_read_only: 'on', server_version: 'offline', server_ssl: false }] }
      if (sql === MODE_SQL) return { rows: [{ read_only: 'on', isolation: 'repeatable read' }] }
      if (sql === SCHEMA_SQL) return { rows: [] }
      if (sql.startsWith(QUERIES.counts)) {
        if (mode === 'query-failure') throw new Error('private payload must not escape')
        if (bindings[0] !== config.maxRows + 1) throw new Error('Missing row ceiling')
        return { rows: counts }
      }
      if (!['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY', 'COMMIT', 'ROLLBACK',
        'SELECT 1 AS read_ok'].includes(sql)) {
        throw new Error('Unexpected SQL')
      }
      return { rows: [] }
    },
  }
  const run = () => collect(config, (options) => {
    if (!options.options.includes('default_transaction_read_only=on')) throw new Error(
      'Missing read-only connection default')
    return client
  }, () => undefined, { queries: QUERIES, classify: (rows) => ({ counts: rows.counts }) })
  return { run, events, counts }
}

test.group('Split totals operator audit without database access', () => {
  test('print-sql mode is offline and prints only the fixed read-only count query', ({ assert }) =>
    {
    const output = execFileSync(process.execPath, ['scripts/auditSplitTotals.mjs', '--print-sql'], {
      encoding: 'utf8' })
    assert.equal(output.trim(), QUERIES.counts)
    assert.notMatch(output, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|CALL)\b/i)
  })
  test('missing execution consent rejects before connection setup', ({ assert }) => {
    const result = spawnSync(process.execPath, ['scripts/auditSplitTotals.mjs', '--database',
      'offline_test'], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.equal(result.stdout, '')
    assert.include(result.stderr, '--execute')
  })
  test('injected client receives count query only after read-only transaction verification', async (
    { assert }) => {
    const f = fixture()
    const result = await f.run()
    assert.deepEqual(result.counts, f.counts)
    const queryIndex = f.events.findIndex((event) => event.startsWith(QUERIES.counts))
    assert.isAbove(queryIndex, f.events.indexOf(MODE_SQL))
    assert.equal(f.events.at(-3), 'COMMIT')
    assert.equal(f.events.at(-2), 'SELECT 1 AS read_ok')
    assert.equal(f.events.at(-1), 'end')
    assert.isTrue(result.completion.transaction_ended)
  })
  test('wrong target fails before reading application rows', async ({ assert }) => {
    const f = fixture('wrong-target')
    await assert.rejects(f.run, 'Live database/server port mismatch; no application rows read.')
    assert.isFalse(f.events.some((event) => event.startsWith(QUERIES.counts)))
    assert.equal(f.events.at(-1), 'end')
  })
  test('query failure rolls back, closes and redacts raw errors', async ({ assert }) => {
    const f = fixture('query-failure')
    let error
    try { await f.run() } catch (value) { error = value }
    assert.instanceOf(error, Error)
    assert.notInclude(error.message, 'private payload')
    assert.equal(f.events.at(-2), 'ROLLBACK')
    assert.equal(f.events.at(-1), 'end')
  })
})
