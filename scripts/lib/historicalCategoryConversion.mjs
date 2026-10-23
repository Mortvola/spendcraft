// Offline operator tooling. No database connection or mutations on import.
import { createHash } from 'node:crypto'
import { URL } from 'node:url'
import { isIP } from 'node:net'
import { auditTransaction, checkedAdd, decimalTextCents, roundAmount, PAGE_SQL } from '../auditTransactionCategoryCents.mjs'

export const sha256 = text => createHash('sha256').update(text).digest('hex')
const supported = [0, 2, 3, 4, 5]

// PostgreSQL inet text may contain a full-width CIDR suffix. Networks are rejected.
export function loopback(value) {
  if (typeof value !== 'string') throw new Error('invalid_loopback_address')
  const [address, prefix, ...rest] = value.split('/')
  const version = isIP(address)
  if (rest.length || !version || (prefix !== undefined && prefix !== (version === 4 ? '32' : '128'))) throw new Error('invalid_loopback_address')
  if (address === '127.0.0.1') return '127.0.0.1'
  const canonical = version === 6 ? new URL(`http://[${address}]/`).hostname : address
  if (canonical === '[::1]') return '::1'
  if (canonical === '[::ffff:7f00:1]') return '127.0.0.1'
  throw new Error('non_loopback_address')
}

export function verifyConnectionConfiguration(config) {
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)
    || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535
    || !/^[a-zA-Z0-9_]+$/.test(config.database ?? '') || !/^[a-zA-Z0-9_]+$/.test(config.user ?? '')) throw new Error('invalid_explicit_connection')
}

export async function discoverTarget(client, config) {
  verifyConnectionConfiguration(config)
  const { rows } = await client.query(IDENTITY_SQL)
  const live = rows[0]
  if (rows.length !== 1 || !/^\d+$/.test(live?.oid ?? '') || !/^\d+$/.test(live?.system_identifier ?? '')) throw new Error('database_identity_unavailable')
  const target = { database: { host: config.host, port: config.port, name: config.database, user: config.user,
    server: loopback(live.server), peer: loopback(live.peer), oid: live.oid, systemIdentifier: live.system_identifier } }
  // Compare the observed connection with .env before accepting any discovered identity.
  if (live.database !== config.database || live.username !== config.user || live.port !== config.port
    || loopback(client.connection?.stream?.remoteAddress) !== target.database.server
    || client.connection?.stream?.remotePort !== config.port) throw new Error('live_database_identity_mismatch')
  await verifyDatabase(client, config, target)
  return target
}

export const IDENTITY_SQL = `SELECT current_database() AS database, current_user AS username,
  inet_server_port() AS port, inet_server_addr()::text AS server, inet_client_addr()::text AS peer,
  (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
  (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`

export function verifyConfigured(config, target) {
  const expected = target.database
  if (config.host !== expected.host || config.port !== expected.port || config.database !== expected.name || config.user !== expected.user) throw new Error('configured_database_mismatch')
}

export async function verifyDatabase(client, config, target) {
  verifyConfigured(config, target)
  const expected = target.database
  const { rows: [live] } = await client.query(IDENTITY_SQL)
  if (live?.database !== expected.name || live.username !== expected.user || live.port !== expected.port
    || live.oid !== expected.oid || live.system_identifier !== expected.systemIdentifier
    || loopback(live.server) !== loopback(expected.server) || loopback(live.peer) !== loopback(expected.peer)
    || loopback(client.connection?.stream?.remoteAddress) !== loopback(expected.server)
    || client.connection.stream.remotePort !== expected.port) throw new Error('live_database_identity_mismatch')
  return live
}

export function convertedAmount(value) {
  if (typeof value === 'string') {
    if (value === '-0.00' || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) || value.length > 24) throw new Error('noncanonical_amount')
    const cents = decimalTextCents(value)
    if (Math.round(Number(value) * 100) !== cents) throw new Error('unsafe_runtime_amount')
    return { cents, stored: value, numeric: false }
  }
  if (typeof value !== 'number') throw new Error('invalid_amount_type')
  const result = roundAmount(value)
  if (!result.encodingMatchesCents || Math.round(Number(result.amountString) * 100) !== result.cents) throw new Error('unsafe_storage_amount')
  return { cents: result.cents, stored: result.amountString, numeric: true, rounded: result.changed }
}

export function classify(row) {
  if (row.deprecated) return { excluded: true, patches: [], kind: 'deprecated' }
  if (Array.isArray(row.links) && row.links.some(link => link?.tracking === 'Balances')) {
    return { excluded: true, patches: [], kind: 'balanceTracked' }
  }
  if (!supported.includes(row.type) || !Array.isArray(row.categories)) throw new Error('unsupported_transaction_shape')
  let numeric = 0, strings = 0, rounded = 0, total = 0
  const patches = []
  row.categories.forEach((allocation, index) => {
    if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)
      || !Number.isSafeInteger(allocation.categoryId) || allocation.categoryId <= 0) throw new Error('malformed_allocation')
    const value = convertedAmount(allocation.amount)
    total = checkedAdd(total, value.cents)
    if (value.numeric) { numeric++; patches.push({ index, stored: value.stored }); if (value.rounded) rounded++ }
    else strings++
  })
  const finding = auditTransaction(row)
  const exception = row.deleted === true && ['fail', 'unsupported'].includes(finding.status)
  const result = { patches, numeric, strings, rounded, total, exception, finding,
    kind: numeric ? strings ? 'mixed' : 'numeric' : strings ? 'string' : 'empty' }
  if (finding.status !== 'pass' && !exception) throw Object.assign(new Error(`conservation_${finding.status}`), { classification: result })
  return result
}

// Uses the existing audit's scoped link/Pool authority, preserving its exclusions.
export const SCAN_SQL = PAGE_SQL.replace('t.id, t.type,', `t.id, t.application_id, t.xmin::text AS row_version,
  md5(to_jsonb(t)::text) AS row_hash, md5((to_jsonb(t)-'categories')::text) AS metadata_hash, t.type,`)

export function leafExpression(patches, start = 1) {
  let expression = 'categories'
  const parameters = []
  if (patches.length > 1000) throw new Error('allocation_count_requires_review')
  patches.forEach(({ index, stored }) => {
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('invalid_patch')
    convertedAmount(stored)
    expression = `jsonb_set(${expression}, $${start + parameters.length}::text[], to_jsonb($${start + parameters.length + 1}::text), false)`
    parameters.push([String(index), 'amount'], stored)
  })
  return { expression, parameters }
}

// Dependencies are injected so failure/atomicity/order can be tested without PostgreSQL.
export async function atomic(client, readOnly, work) {
  await client.query(`BEGIN ISOLATION LEVEL REPEATABLE READ ${readOnly ? 'READ ONLY' : 'READ WRITE'}`)
  let committing = false
  try {
    const result = await work()
    committing = true
    await client.query('COMMIT')
    return result
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* Never restart anything; connection state remains uncertain. */ }
    if (committing) throw new Error('commit_outcome_unknown_inspect_snapshot_before_retry')
    throw error
  }
}
