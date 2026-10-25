// Offline preparation only: no PostgreSQL, SSH, application bootstrap or cleanup.
import process from 'node:process'
import console from 'node:console'
import { readFile, mkdir, mkdtemp, writeFile, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)))
const profilePath = new URL('./fixtures/stagingRestoreConstraintInventory.json', import.meta.url)
const castEquivalences = JSON.parse(await readFile(new URL('./fixtures/stagingRestoreCastEquivalences.json', import.meta.url), 'utf8'))
const sha = value => createHash('sha256').update(value).digest('hex')
const requireValue = (condition, code) => { if (!condition) throw new Error(code) }
const key = row => JSON.stringify([row.schema, row.table, row.name])
const kinds = { c: 'CHECK', f: 'FOREIGN KEY', p: 'PRIMARY KEY', u: 'UNIQUE' }

// Whole-expression allowlist, not a SQL parser or general cast remover.
export function normalizeConstraintDefinition(row) {
  const pair = castEquivalences.find(item => ['schema', 'table', 'name', 'type', 'validated']
    .every(field => row[field] === item[field]))
  return pair && row.definition === pair.restored ? pair.original : row.definition
}

export function canonicalConstraints(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0, 'missing_constraint_inventory')
  const seen = new Set()
  return rows.map(row => {
    requireValue(row && ['schema', 'table', 'name'].every(field => /^[a-z_][a-z_0-9]*$/.test(row[field] ?? '')),
      'invalid_constraint_identity')
    requireValue(Object.hasOwn(kinds, row.type) && typeof row.definition === 'string'
      && row.definition.startsWith(kinds[row.type] + ' ') && typeof row.validated === 'boolean',
    'invalid_constraint_classification')
    requireValue(!seen.has(key(row)), 'duplicate_constraint_identity')
    seen.add(key(row))
    return { schema: row.schema, table: row.table, name: row.name, type: row.type,
      definition: normalizeConstraintDefinition(row), validated: row.validated }
  }).sort((a, b) => key(a).localeCompare(key(b)))
}

export function assertConstraints(expected, actual) {
  requireValue(JSON.stringify(canonicalConstraints(expected)) === JSON.stringify(canonicalConstraints(actual)),
    'constraint_inventory_mismatch')
}

export async function validateProfile(profile, readSource = path => readFile(resolve(repository, path), 'utf8')) {
  requireValue(profile?.format === 1 && Array.isArray(profile.sourceChecks)
    && Array.isArray(profile.dumpAddConstraintNames), 'invalid_constraint_profile')
  requireValue(profile.target?.environment === 'staging' && profile.target.oid === 17260
    && profile.target.database === 'spendcraft_restore_verify_20261024_2429cd_huh_tnmi', 'wrong_restore_target')
  const rows = canonicalConstraints(profile.constraints)
  const checks = rows.filter(row => row.type === 'c')
  requireValue(new Set(profile.sourceChecks.map(row => row.name)).size === profile.sourceChecks.length,
    'duplicate_source_check')
  requireValue(JSON.stringify(checks.map(row => row.name).sort())
    === JSON.stringify(profile.sourceChecks.map(row => row.name).sort()), 'source_check_inventory_mismatch')
  requireValue(JSON.stringify(rows.filter(row => row.type !== 'c').map(row => row.name).sort())
    === JSON.stringify([...profile.dumpAddConstraintNames].sort()), 'dump_constraint_inventory_mismatch')
  for (const source of profile.sourceChecks) {
    requireValue(/^database\/migrations\/[a-z_0-9]+\.ts$/.test(source.file)
      && typeof source.declaration === 'string' && source.declaration.length > 0,
    'invalid_source_reference')
    const contents = await readSource(source.file)
    requireValue(sha(contents) === source.sha256 && contents.split(source.declaration).length === 2,
      'constraint_source_evidence_changed')
  }
  return rows
}

export function constraintAssertionSQL(rows) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  const values = canonicalConstraints(rows).map(row => '    ('
    + [row.schema, row.table, row.name, row.type, row.definition].map(quote).join(', ')
    + ', ' + String(row.validated) + ')').join(',\n')
  const cases = castEquivalences.map(pair => `WHEN n.nspname = ${quote(pair.schema)} AND t.relname = ${quote(pair.table)}
      AND c.conname = ${quote(pair.name)} AND c.contype = 'c' AND c.convalidated
      AND pg_get_constraintdef(c.oid, false) = ${quote(pair.restored)} THEN ${quote(pair.original)}`).join('\n    ')
  return `SELECT count(*) = 2 AND bool_and(
  (a.attname = 'status' AND format_type(a.atttypid, a.atttypmod) = 'character varying(255)' AND a.attnotnull)
  OR (a.attname = 'encrypted_access_token' AND format_type(a.atttypid, a.atttypmod) = 'text' AND NOT a.attnotnull)
) AS accepted FROM pg_attribute a
WHERE a.attrelid = 'public.plaid_item_cleanups'::regclass
  AND a.attname IN ('status', 'encrypted_access_token') AND NOT a.attisdropped \\gset
\\if :accepted
\\else
SELECT 1/0 AS constraint_column_type_mismatch;
\\endif
WITH expected(schema_name, table_name, constraint_name, constraint_type, definition, validated) AS (
  VALUES
${values}
), actual AS (
  SELECT n.nspname::text, t.relname::text, c.conname::text, c.contype::text,
    CASE ${cases}
      ELSE pg_get_constraintdef(c.oid, false) END, c.convalidated
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  LEFT JOIN pg_class t ON t.oid = c.conrelid
  WHERE n.nspname = 'public'
)
SELECT NOT EXISTS(SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
  AND NOT EXISTS(SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
  AS accepted \\gset
\\if :accepted
\\else
SELECT 1/0 AS constraint_inventory_mismatch;
\\endif`
}

export function replaceConstraintAssertion(baseSQL, rows) {
  const pattern = /^SELECT \* FROM \(SELECT array_agg\(name::text ORDER BY name\)=[^\n]+pg_constraint[^\n]+\n\\if :accepted\n\\else\nSELECT 1\/0 AS constraint_inventory_mismatch;\n\\endif/gm
  requireValue([...baseSQL.matchAll(pattern)].length === 1, 'ambiguous_previous_constraint_assertion')
  return baseSQL.replace(pattern, () => constraintAssertionSQL(rows))
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: {
    'base-sql': { type: 'string' }, 'output-parent': { type: 'string' },
  } })
  requireValue(Boolean(values['base-sql'] && values['output-parent']), 'explicit_preparation_arguments_required')
  const parent = resolve(values['output-parent'])
  const path = relative(join(repository, 'script-output'), parent)
  requireValue(!path.startsWith('..') && !isAbsolute(path), 'output_must_be_under_script_output')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const actualPath = relative(await realpath(join(repository, 'script-output')), await realpath(parent))
  requireValue(!actualPath.startsWith('..') && !isAbsolute(actualPath), 'output_must_be_under_script_output')
  const output = await mkdtemp(join(parent, 'restore-verification-'))
  console.log(output)
  const profile = JSON.parse(await readFile(profilePath, 'utf8'))
  const rows = await validateProfile(profile)
  const sql = replaceConstraintAssertion(await readFile(resolve(values['base-sql']), 'utf8'), rows)
  await writeFile(join(output, 'corrected-verification.sql'), sql, { flag: 'wx', mode: 0o600 })
  await writeFile(join(output, 'constraint-inventory.json'), JSON.stringify({
    target: profile.target, sourceHead: profile.sourceHead, backupSha256: profile.backupSha256,
    constraints: rows, classifications: rows.reduce((counts, row) => {
      counts[row.type] = (counts[row.type] ?? 0) + 1
      return counts
    }, {}), sqlSha256: sha(sql), databaseConnected: false,
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(/^[a-z_]+$/.test(error.message) ? error.message : 'offline_preparation_failed')
    process.exitCode = 1
  })
}
