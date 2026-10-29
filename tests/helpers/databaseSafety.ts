import type { Database } from '@adonisjs/lucid/database'

const authorizedTestTarget = 'localhost:5432/spendcraft_test'
export const identitySql = `SELECT current_database() AS database, inet_server_port() AS port,
  inet_server_addr()::text AS server, inet_client_addr()::text AS peer,
  current_user AS username, session_user AS authenticated_user`

interface Target { host: string, port: number, database: string }
interface Identity { database: string, port: number, server: string, peer: string }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
export function configuredTarget(value: unknown): Target {
  if (!record(value) || value.host !== 'localhost' || Number(value.port) !== 5432 || value
    .database !== 'spendcraft_test') {
    throw new Error(`Test database safety: configured target must be ${authorizedTestTarget}`)
  }
  return { host: 'localhost', port: 5432, database: 'spendcraft_test' }
}
function configuredUser(value: unknown): string {
  if (!record(value) || typeof value.user !== 'string' || !value.user.trim()) {
    throw new Error('Test database safety: configured user missing')
  }
  return value.user
}
function loopback(value: unknown) {
  return typeof value === 'string' &&
    /^(127\.0\.0\.1(?:\/32)?|::1(?:\/128)?|::ffff:127\.0\.0\.1(?:\/128)?)$/.test(value)
}
export function liveIdentity(value: unknown): Identity {
  if (!record(value) || value.database !== 'spendcraft_test' || Number(value.port) !== 5432
    || !loopback(value.server) || !loopback(value.peer)) {
    throw new Error('Test database safety: live identity is not authorized')
  }
  return { database: 'spendcraft_test', port: 5432, server: String(value.server), peer: String(value
    .peer) }
}
export function destructiveSql(sql: string) {
  // Conservative: comments/CTEs/batches cannot conceal a destructive statement.
  return new RegExp(
"\\b(?:insert|update|delete|truncate|alter|drop|create|gr" +
"ant|revoke|comment|vacuum|reindex|copy|call|do)\\b",
"i").test(sql)
}
function identityResult(value: unknown) {
  if (!record(value) || !record(value.response) || !Array.isArray(value.response.rows)) {
    throw new Error('Test database safety: missing live identity response')
  }
  return liveIdentity(value.response.rows[0])
}

// Installed only by the test bootstrap. Knex transaction clients inherit the
// driver prototype, so raw SQL, schema builders and ORM deletes all pass here.
export async function installDatabaseSafety(db: Database) {
  const names = ['pg', 'pgLog'] as const
  function checkConfigurations() {
    for (const name of names) {
      const connection = db.manager.get(name)?.config.connection
      configuredTarget(connection)
      configuredUser(connection)
    }
  }
  checkConfigurations() // Fail before acquiring any connection on mismatch.
  const clients = names.map((name) => db.connection(name).getWriteClient().client)
  const prototype: object | null = Reflect.getPrototypeOf(clients[0])
  if (!prototype || Reflect.getPrototypeOf(clients[1]) !== prototype) throw new Error(
    'Test database safety: unexpected driver')
  const candidate: unknown = Reflect.get(prototype, 'query')
  if (typeof candidate !== 'function') throw new Error(
    'Test database safety: driver query unavailable')
  const original = candidate
  const verificationConnections: unknown[] = []
  let checks = 0
  let guarded = 0
  async function identify(client: object, connection: unknown, expectedUser?: string) {
    const result: unknown = await Reflect.apply(original, client, [connection, { sql: identitySql,
      bindings: [] }])
    const identity = identityResult(result)
    if (!record(result) || !record(result.response) || !Array.isArray(result.response
      .rows)) throw new Error('Test database safety: missing user identity')
    const row: unknown = result.response.rows[0]
    const users = names.map(name => {
      const config = db.manager.get(name)?.config.connection
      return configuredUser(config)
    })
    if (!record(row) || typeof row.username !== 'string' || row.username !== row.authenticated_user
      || (expectedUser ? row.username !== expectedUser : !users.includes(row.username))) {
      throw new Error('Test database safety: authenticated user mismatch')
    }
    return { ...identity, username: row.username, authenticated_user: row.authenticated_user }
  }
  async function verify() {
    checkConfigurations()
    const evidence = []
    for (let i = 0; i < clients.length; i++) {
      evidence.push({ connection: names[i], configured: configuredTarget(db.manager.get(names[i])
        ?.config.connection),
        live: await identify(clients[i], verificationConnections[i], configuredUser(db.manager.get(
          names[i])?.config.connection)) })
    }
    checks++
    if (checks === 1) console.info('Test database safety verified', JSON.stringify(evidence))
  }
  try {
    for (const client of clients) verificationConnections.push(await client.acquireConnection())
    await verify()
  } catch (error) {
    for (let i = 0; i < verificationConnections.length; i++) await clients[i].releaseConnection(
      verificationConnections[i])
    throw error
  }
  Reflect.set(prototype, 'query', async function (this: object, connection: unknown,
    query: unknown) {
    const sql: unknown = typeof query === 'string' ? query : record(query) ? query.sql : undefined
    if (typeof sql !== 'string') throw new Error('Test database safety: unrecognized query')
    if (destructiveSql(sql)) {
      await verify() // Independently rerun configured and live pg AND pgLog checks.
      await identify(this, connection) // Also prove this exact destructive connection.
      guarded++
    }
    return Reflect.apply(original, this, [connection, query])
  })
  return {
    verify,
    async close() {
      Reflect.set(prototype, 'query', original)
      for (let i = 0; i < clients.length; i++) await clients[i].releaseConnection(
        verificationConnections[i])
      console.info(
        `Test database safety: ${checks} independent checks; ${guarded} guarded SQL operations`)
    },
  }
}
