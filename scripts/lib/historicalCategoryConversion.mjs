// Offline operator tooling. No database connection or mutations on import.
import { createHash } from 'node:crypto'
import { URL } from 'node:url'
import { isIP } from 'node:net'
import { isAbsolute, resolve, relative } from 'node:path'
import { auditTransaction, checkedAdd, decimalTextCents, roundAmount, PAGE_SQL } from '../auditTransactionCategoryCents.mjs'

export const sha256 = text => createHash('sha256').update(text).digest('hex')
export const MAINTENANCE = 'All financial writers, schedulers, provider commands and traffic are stopped and fenced'
const supported = [0, 2, 3, 4, 5]
const emptyOrdinary = [3974, 3975, 3977, 4116, 4262, 4412, 4413, 4415]
const emptyFunding = [2578, 3077, 3388]

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

export function validatePlan(plan) {
  if (plan?.format !== 1 || !['production', 'staging'].includes(plan.environment)) throw new Error('explicit_environment_required')
  for (const name of ['production', 'staging']) {
    const target = plan.targets?.[name]
    if (!target || !/^i-[a-f0-9]{8,17}$/.test(target.instanceId) || !/^[a-z]{2}-[a-z]+-\d$/.test(target.region)
      || !/^\d{12}$/.test(target.accountId) || isIP(target.privateIp) !== 4
      || !isAbsolute(target.root ?? '') || resolve(target.root) !== target.root
      || !isAbsolute(target.envFile ?? '') || !['localhost', '127.0.0.1', '::1'].includes(target.database?.host)
      || !Number.isInteger(target.database.port) || target.database.port < 1 || target.database.port > 65535
      || !/^[a-zA-Z0-9_]+$/.test(target.database.name ?? '') || !/^[a-zA-Z0-9_]+$/.test(target.database.user ?? '')
      || ['spendcraft_test', 'spendcraft_sandbox'].includes(target.database.name)) throw new Error('invalid_explicit_target')
    loopback(target.database.server); loopback(target.database.peer)
    if (!/^\d+$/.test(target.database.systemIdentifier ?? '') || !/^\d+$/.test(target.database.oid ?? '')
      || !/^[a-f0-9]{64}$/.test(target.release ?? '')) throw new Error('reviewed_identity_required')
  }
  const { staging: a, production: b } = plan.targets
  if (a.instanceId === b.instanceId || a.privateIp === b.privateIp || a.root === b.root
    || !relative(a.root, b.root).startsWith('..') || !relative(b.root, a.root).startsWith('..')
    || a.database.name === b.database.name) throw new Error('targets_not_isolated')
  return plan.targets[plan.environment]
}

export function verifyHost(document, target) {
  if (document?.instanceId !== target.instanceId || document.region !== target.region
    || document.accountId !== target.accountId || document.privateIp !== target.privateIp) throw new Error('ec2_identity_mismatch')
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
  const id = Number(row.id)
  const exception = row.deleted === true && (
    (emptyOrdinary.includes(id) && [0, 5].includes(row.type) && row.categories.length === 0 && finding.status === 'fail')
    || (emptyFunding.includes(id) && row.type === 2 && row.categories.length === 0 && finding.reason === 'empty_funding_or_rebalance_not_supported_by_endpoint')
    || ([4596, 4597].includes(id) && row.type === 2 && finding.status === 'fail' && finding.differenceCents === 9))
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

export function exactConfirmation(operation, plan, snapshotHash = '') {
  const target = validatePlan(plan)
  return `${operation} ${plan.environment} ${target.database.name} ${target.instanceId} ${target.release}${snapshotHash ? ` ${snapshotHash}` : ''}`
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
