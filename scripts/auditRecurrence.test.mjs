import process from 'node:process'
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { QUERIES, classify, collectRecurrence } from './auditRecurrence.mjs'
import { configuration, VERIFY_SQL, MODE_SQL } from './auditLegacyMoney.mjs'
const data = () => ({ recurrenceSchema: [{ data_type: 'integer', is_nullable: 'NO' }],
  recurrenceCounts: [{ total: '2', minimum: '1', maximum: '360', below: '0', above: '0', nulls: '0', noninteger: '0' }], incompatibleRows: [] })
const config = () => configuration({ SPENDCRAFT_AUDIT_DATABASE: 'example', SPENDCRAFT_AUDIT_SOCKET_DIR: '/run/postgresql', SPENDCRAFT_AUDIT_PORT: '5433' })
function mock(overrides = {}) {
  const client = new EventEmitter()
  client.connection = new EventEmitter()
  client.calls = []
  client.connect = async () => { client.connected = true }
  client.end = async () => { client.closed = true }
  client.query = async sql => {
    client.calls.push(sql)
    client.connection.emit('readyForQuery', { status: ['COMMIT', 'ROLLBACK', 'SELECT 1 AS read_ok'].includes(sql) ? 'I' : 'T' })
    if (sql === VERIFY_SQL) return { rows: [{ database: overrides.database ?? 'example', port: 5433, default_read_only: 'on' }] }
    if (sql === MODE_SQL) return { rows: [{ read_only: overrides.readOnly ?? 'on', isolation: overrides.isolation ?? 'repeatable read' }] }
    for (const [key, q] of Object.entries(QUERIES)) if (sql.startsWith(q)) {
      if (overrides.fail) throw new Error('secret credential')
      return { rows: data()[key] }
    }
    return { rows: [] }
  }
  return client
}
test('exact boundaries, empty table and invalid IDs', () => {
  assert.equal(classify(data()).outcome, 'COMPATIBLE')
  const d = data(); d.recurrenceCounts[0] = { ...d.recurrenceCounts[0], total: '0', minimum: null, maximum: null }
  assert.equal(classify(d).outcome, 'COMPATIBLE')
  d.recurrenceCounts[0].below = '1'; d.incompatibleRows = [{ id: '17', recurrence: '0' }]
  assert.equal(classify(d).outcome, 'INCOMPATIBLE')
})
test('schema drift and incomplete evidence fail closed', () => {
  const d = data(); d.recurrenceSchema[0].is_nullable = 'YES'
  assert.throws(() => classify(d))
  const e = data(); e.recurrenceCounts[0].above = '1'
  assert.throws(() => classify(e))
})
test('no execution mode and mandatory database', () => {
  const r = spawnSync(process.execPath, ['scripts/auditRecurrence.mjs'], { encoding: 'utf8' })
  assert.equal(r.status, 2); assert.match(r.stderr, /INCOMPLETE/)
  assert.throws(() => configuration({}))
})
test('all application SQL is SELECT-only, scoped to recurrence and IDs', () => {
  for (const sql of Object.values(QUERIES)) {
    assert.match(sql, /^SELECT/)
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|MERGE|CALL)\b/i)
    assert.doesNotMatch(sql, /\b(name|description|budget_id|transaction_categories)\b/i)
  }
})
for (const overrides of [{ database: 'wrong' }, { readOnly: 'off' }, { isolation: 'read committed' }]) {
  test(`safety failure ${JSON.stringify(overrides)} precedes row reads`, async () => {
    const c = mock(overrides)
    await assert.rejects(collectRecurrence(config(), () => c))
    assert.equal(c.closed, true)
    assert.ok(!c.calls.some(sql => sql.startsWith(QUERIES.recurrenceCounts)))
  })
}
test('normal completion and failed query cleanup', async () => {
  const c = mock(); const r = await collectRecurrence(config(), () => c)
  assert.equal(r.outcome, 'COMPATIBLE'); assert.equal(c.closed, true)
  assert.ok(c.calls.includes('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
  assert.ok(c.calls.includes('COMMIT')); assert.ok(c.calls.includes('SELECT 1 AS read_ok'))
  const bad = mock({ fail: true })
  await assert.rejects(collectRecurrence(config(), () => bad), error => !error.message.includes('secret'))
  assert.ok(bad.calls.includes('ROLLBACK')); assert.equal(bad.closed, true)
})
