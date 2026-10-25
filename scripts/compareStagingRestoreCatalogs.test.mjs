import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { catalogQueries } from './stagingRestoreCatalogQueries.mjs'
import { compareCatalogs, verifyIdentity, loopback, target, collect } from './compareStagingRestoreCatalogs.mjs'
const clone = value => JSON.parse(JSON.stringify(value))
const baseline = JSON.parse(await readFile(new URL('./fixtures/stagingRestoreBackupDataBaseline.json', import.meta.url), 'utf8'))
function pair() {
  const catalog = Object.fromEntries(Object.keys(catalogQueries).map(key => [key, []]))
  catalog.relations = [{ key: 'public.example', relkind: 'r', owner: 'ubuntu' }]
  catalog.columns = [{ key: 'public.example.amount', type: 'pg_catalog.numeric', modifier: 786438,
    formatted_type: 'numeric(12,2)', not_null: true, identity: '', generated: '', expression: '0' }]
  const live = { format: 1, identity: { database: target.live }, catalog,
    rowCounts: Object.fromEntries([...Object.entries(baseline.rowCounts).map(([key, value]) => [key, String(value)]), ['public.example', '5']]), sequenceValues: { 'public.example_id_seq': { last_value: '5', is_called: true } } }
  const restored = clone(live)
  restored.identity = { database: target.restored, oid: target.oid }
  return [live, restored]
}
test('identical complete catalogs match but do not claim full backup verification', () => {
  const result = compareCatalogs(...pair())
  assert.equal(result.schemaComparisonPassed, true)
  assert.equal(result.fullRestoreVerified, false)
  assert.ok(result.sections.every(row => row.classification === 'MATCH'))
})
for (const field of ['type', 'modifier', 'formatted_type', 'not_null', 'identity', 'generated', 'position', 'collation', 'storage']) {
  test(`changed column ${field} fails even with identical object counts`, () => {
    const [a, b] = pair(); b.catalog.columns[0][field] = 'changed'
    assert.equal(compareCatalogs(a, b).schemaComparisonPassed, false)
  })
}
for (const [section, property] of [
  ['columns', 'expression'], ['constraints', 'confdeltype'], ['constraints', 'confupdtype'],
  ['constraints', 'validated'], ['constraints', 'definition'], ['indexes', 'predicate'],
  ['indexes', 'keys'], ['indexes', 'opclasses'], ['indexes', 'collations'], ['indexes', 'options'],
  ['sequences', 'seqincrement'], ['sequences', 'owned_by'], ['extensions', 'extversion'],
  ['views', 'definition'], ['routines', 'prosrc'], ['triggers', 'definition'], ['rules', 'definition'],
  ['schemas', 'acl'], ['relations', 'owner'], ['policies', 'qual'],
]) {
  test(`different ${section}.${property} never passes`, () => {
    const [a, b] = pair()
    a.catalog[section] = [{ key: 'public.object', [property]: 'original' }]
    b.catalog[section] = [{ key: 'public.object', [property]: 'changed' }]
    const result = compareCatalogs(a, b)
    assert.equal(result.schemaComparisonPassed, false)
    assert.equal(result.differences.length, 1)
  })
}
for (const section of ['relations', 'columns', 'constraints', 'indexes', 'sequences', 'extensions', 'schemas']) {
  test(`missing and extra ${section} are rejected`, () => {
    const [a, b] = pair()
    a.catalog[section] = [{ key: 'one' }]; b.catalog[section] = [{ key: 'two' }]
    assert.equal(compareCatalogs(a, b).counts['MATERIAL DIFFERENCE'], 2)
  })
}
test('migration drift is unresolved rather than silently assumed to be backup age', () => {
  const [a, b] = pair(); a.catalog.migrations = [{ key: 'new_migration', batch: 3 }]
  assert.equal(compareCatalogs(a, b).counts.UNRESOLVED, 1)
})
test('current live row counts and sequence values may differ without establishing historical accuracy', () => {
  const [a, b] = pair(); b.rowCounts['public.example'] = '0'; b.sequenceValues = {}
  const result = compareCatalogs(a, b)
  assert.equal(result.counts['EXPECTED DIFFERENCE'], 2)
  assert.equal(result.fullRestoreVerified, false)
})
test('deterministic comparison ignores row/key ordering and never mutates snapshots', () => {
  const [a, b] = pair(); a.catalog.schemas = [{ key: 'z' }, { key: 'a' }]; b.catalog.schemas = clone(a.catalog.schemas).reverse()
  const original = clone([a, b])
  const first = compareCatalogs(a, b); const second = compareCatalogs(a, b)
  assert.deepEqual(first, second); assert.deepEqual([a, b], original)
})
test('missing sections and duplicate identities fail closed', () => {
  const [a, b] = pair(); delete b.catalog.rules
  assert.throws(() => compareCatalogs(a, b), /incomplete_catalog/)
  b.catalog.rules = [{ key: 'same' }, { key: 'same' }]
  assert.throws(() => compareCatalogs(a, b), /duplicate/)
})
const casts = JSON.parse(await readFile(new URL('./fixtures/stagingRestoreCastEquivalences.json', import.meta.url), 'utf8'))
for (const cast of casts) {
  test(`${cast.name}: only reviewed cast equivalence with verified column types passes`, () => {
    const [a, b] = pair()
    const columns = [
      { key: 'public.plaid_item_cleanups.status', type: 'pg_catalog.varchar', modifier: 259, not_null: true },
      { key: 'public.plaid_item_cleanups.encrypted_access_token', type: 'pg_catalog.text', modifier: -1, not_null: false },
    ]
    a.catalog.columns = clone(columns); b.catalog.columns = clone(columns)
    a.catalog.constraints = [{ ...cast, key: cast.name, definition: cast.original }]
    b.catalog.constraints = [{ ...cast, key: cast.name, definition: cast.restored }]
    assert.equal(compareCatalogs(a, b).schemaComparisonPassed, true)
    b.catalog.constraints[0].definition = cast.restored.replace('cancelled', 'unknown')
    assert.equal(compareCatalogs(a, b).counts.UNRESOLVED, 1)
    b.catalog.constraints[0].definition = cast.restored
    a.catalog.columns[0].modifier = 260; b.catalog.columns[0].modifier = 260
    assert.equal(compareCatalogs(a, b).counts.UNRESOLVED, 1)
  })
}
test('strict identity distinguishes both databases and execution socket', () => {
  const identity = { database: target.restored, username: 'ubuntu', authenticated_user: 'ubuntu', port: 5432,
    server: '127.0.0.1/32', peer: '::1/128', read_only: 'on', isolation: 'repeatable read', oid: 17260 }
  const socket = { remoteAddress: '127.0.0.1', remotePort: 5432 }
  verifyIdentity(identity, target.restored, socket)
  for (const change of [{ oid: 1 }, { database: 'spendcraft' }, { server: '10.0.0.1' }, { read_only: 'off' },
    { username: 'postgres' }, { authenticated_user: 'postgres' }, { port: 5433 }, { isolation: 'read committed' }]) {
    assert.throws(() => verifyIdentity({ ...identity, ...change }, target.restored, socket))
  }
  assert.throws(() => verifyIdentity(identity, target.restored, { ...socket, remoteAddress: '10.0.0.1' }))
  assert.throws(() => verifyIdentity(identity, 'spendcraft_sandbox', socket))
  for (const address of ['127.0.0.1/24', '127.0.0.1/', 'localhost', '127.0.0.1/32/1', '::1/64']) assert.equal(loopback(address), false)
})
test('all static catalog queries are SELECT-only and contain no generated mutation', () => {
  for (const sql of Object.values(catalogQueries)) {
    assert.match(sql.trim(), /^SELECT /)
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|nextval|setval)\b/i)
  }
})
test('CLI requires explicit staging mode and does not connect when invoked without it', () => {
  for (const args of [[], ['--target', 'production'], ['--target', 'staging', '--cleanup'], ['--target', 'staging']]) {
    const result = spawnSync(process.execPath, ['scripts/compareStagingRestoreCatalogs.mjs', ...args], { encoding: 'utf8' })
    assert.equal(result.status, 1); assert.equal(result.stdout, '')
  }
})

test('unsupported schema features remain unresolved even when present in both databases', () => {
  const [a, b] = pair()
  a.catalog.unsupported = [{ key: 'type:public.custom', kind: 'custom type/domain/enum' }]
  b.catalog.unsupported = clone(a.catalog.unsupported)
  const result = compareCatalogs(a, b)
  assert.equal(result.schemaComparisonPassed, false)
  assert.equal(result.counts.UNRESOLVED, 2)
})

test('restored data is compared with backup-time counts, not current live activity', () => {
  const [a, b] = pair()
  a.rowCounts['public.transactions'] = '999'
  assert.equal(compareCatalogs(a, b).schemaComparisonPassed, true)
  b.rowCounts['public.transactions'] = '1'
  const result = compareCatalogs(a, b)
  assert.ok(result.differences.some(row => row.section === 'backupData' && row.classification === 'MATERIAL DIFFERENCE'))
  assert.equal(result.schemaComparisonPassed, false)
})

// Exercise the actual collector with a driver double; no PostgreSQL connection.
function foreignKeyDriver(fk) {
  const calls = []
  class Client {
    constructor() { this.connection = { stream: { remoteAddress: '127.0.0.1', remotePort: 5432 } } }
    async connect() { calls.push('connect') }
    async end() { calls.push('end') }
    async query(sql) {
      calls.push(sql)
      if (sql.includes('current_database() AS database')) return { rows: [{ database: target.live,
        username: 'ubuntu', authenticated_user: 'ubuntu', port: 5432, server: '127.0.0.1/32',
        peer: '127.0.0.1/32', read_only: 'on', isolation: 'repeatable read' }] }
      for (const [section, query] of Object.entries(catalogQueries)) {
        if (sql === `SELECT * FROM (${query}) bounded_catalog LIMIT 10001`) {
          return { rows: section === 'constraints' ? [fk] : [] }
        }
      }
      if (sql.includes(' AS violations ')) return { rows: [{ violations: '0' }] }
      if (sql.includes('public.crosstab')) return { rows: [{ amount: 42 }] }
      return { rows: [] }
    }
  }
  return { Client, calls }
}
const singleForeignKey = { key: 'public.account_transactions.account_transactions_account_id_foreign',
  schema: 'public', table: 'account_transactions', type: 'f', columns: ['account_id'],
  referenced_table: 'public.accounts', referenced_columns: ['id'], confmatchtype: 's' }

test('both constraint column-name arrays explicitly use the supported text[] driver type', () => {
  assert.match(catalogQueries.constraints, /ORDER BY k\.ord\)::text\[\] AS columns/)
  assert.match(catalogQueries.constraints, /ORDER BY k\.ord\)::text\[\] AS referenced_columns/)
  assert.match(catalogQueries.constraints, /unnest\(c\.conkey\) WITH ORDINALITY/)
  assert.match(catalogQueries.constraints, /unnest\(c\.confkey\) WITH ORDINALITY/)
})
for (const mode of ['s', 'f']) {
  for (const composite of [false, true]) {
    test(`collector accepts ${composite ? 'composite' : 'single-column'} FK MATCH ${mode} and preserves column pairing`, async () => {
      const fk = { ...singleForeignKey, confmatchtype: mode,
        columns: composite ? ['budget_id', 'account_id'] : ['account_id'],
        referenced_columns: composite ? ['budget_id', 'id'] : ['id'] }
      const { Client, calls } = foreignKeyDriver(fk)
      const snapshot = await collect(target.live, { PG_HOST: 'localhost', PG_USER: 'ubuntu' }, Client)
      assert.deepEqual(snapshot.catalog.constraints, [fk])
      const integritySQL = calls.find(sql => sql.includes(' AS violations '))
      assert.ok(integritySQL.includes('FROM "public"."account_transactions" s'))
      assert.ok(integritySQL.includes('FROM "public"."accounts" r'))
      assert.ok(integritySQL.includes(composite
        ? 's."budget_id"=r."budget_id" AND s."account_id"=r."id"' : 's."account_id"=r."id"'))
      if (mode === 'f') assert.ok(integritySQL.includes(' IS NULL'))
      else assert.ok(!integritySQL.includes(' IS NULL'))
      assert.deepEqual(snapshot.integrity, [{ key: fk.key, violations: '0' }])
      assert.ok(calls.includes('ROLLBACK'))
    })
  }
}
for (const [label, changes] of [
  ['raw name[] strings', { columns: '{account_id}', referenced_columns: '{id}' }],
  ['local string', { columns: '{account_id}' }],
  ['referenced string', { referenced_columns: '{id}' }],
  ['null local columns', { columns: null }],
  ['missing referenced columns', { referenced_columns: undefined }],
  ['empty arrays', { columns: [], referenced_columns: [] }],
  ['unequal arity', { columns: ['budget_id', 'account_id'] }],
  ['non-string name', { columns: [42] }],
  ['unsupported match mode', { confmatchtype: 'p' }],
]) {
  test(`collector rejects malformed FK driver result: ${label}`, async () => {
    const { Client, calls } = foreignKeyDriver({ ...singleForeignKey, ...changes })
    await assert.rejects(collect(target.live, { PG_HOST: 'localhost', PG_USER: 'ubuntu' }, Client),
      /unsupported_foreign_key_shape/)
    assert.ok(!calls.some(sql => sql.includes(' AS violations ')))
    assert.equal(calls.at(-1), 'end')
  })
}

test('trigger key CASE uses text for both branches, avoiding PostgreSQL name truncation', () => {
  assert.match(catalogQueries.triggers, /ELSE t\.tgname::text END AS key/)
  assert.match(catalogQueries.triggers, /co\.conname\|\|':'\|\|fn\.nspname\|\|'\.'\|\|p\.proname\|\|':'\|\|t\.tgtype::text/)
  assert.doesNotMatch(catalogQueries.triggers, /ELSE t\.tgname END/)
})

test('full stable keys distinguish the recorded internal INSERT and UPDATE triggers', () => {
  const [a, b] = pair()
  const prefix = 'public.account_transactions.'
  const internalPrefix = 'constraint:account_transactions_account_id_foreign:pg_catalog.'
  const insert = { key: prefix + internalPrefix + 'RI_FKey_check_ins:5',
    function: 'pg_catalog.RI_FKey_check_ins()', tgtype: 5, tgisinternal: true }
  const update = { key: prefix + internalPrefix + 'RI_FKey_check_upd:17',
    function: 'pg_catalog.RI_FKey_check_upd()', tgtype: 17, tgisinternal: true }
  // The old CASE coerced each entire internal suffix to PostgreSQL name (63 bytes).
  assert.equal(insert.key.slice(prefix.length).slice(0, 63), update.key.slice(prefix.length).slice(0, 63))
  assert.notEqual(insert.key, update.key)
  a.catalog.triggers = [insert, update]
  b.catalog.triggers = [clone(update), clone(insert)]
  assert.equal(compareCatalogs(a, b).schemaComparisonPassed, true)
  b.catalog.triggers.pop()
  assert.equal(compareCatalogs(a, b).schemaComparisonPassed, false)
})

test('identical explicit trigger names on different tables have distinct identities', () => {
  const [a, b] = pair()
  a.catalog.triggers = [{ key: 'public.accounts.updated', definition: 'accounts trigger' },
    { key: 'public.transactions.updated', definition: 'transactions trigger' }]
  b.catalog.triggers = clone(a.catalog.triggers).reverse()
  assert.equal(compareCatalogs(a, b).schemaComparisonPassed, true)
})

test('genuinely duplicate and missing trigger identities still fail closed', () => {
  const [a, b] = pair()
  const trigger = { key: 'public.accounts.updated', tgtype: 17 }
  a.catalog.triggers = [trigger]
  b.catalog.triggers = [clone(trigger), clone(trigger)]
  assert.throws(() => compareCatalogs(a, b), /duplicate_or_missing_object_identity/)
  b.catalog.triggers = [{ tgtype: 17 }]
  assert.throws(() => compareCatalogs(a, b), /duplicate_or_missing_object_identity/)
})
