import { test } from '@japa/runner'
import { installDatabaseSafety, identitySql } from '../helpers/databaseSafety.js'

function fixture() {
  const events = []
  const configs = { pg: { host: 'localhost', port: 5432, database: 'spendcraft_test', user:
    'test_role' },
    pgLog: { host: 'localhost', port: 5432, database: 'spendcraft_test', user: 'test_role' } }
  const identities = { pg: { database: 'spendcraft_test', user: 'test_role', port: 5432, server:
    '127.0.0.1', peer: '::1/128', username: 'test_role', authenticated_user: 'test_role' },
    pgLog: { database: 'spendcraft_test', user: 'test_role', port: 5432, server: '::1', peer:
      '127.0.0.1', username: 'test_role', authenticated_user: 'test_role' } }
  class Driver {
    constructor(name) { this.name = name }
    async acquireConnection() { events.push(`acquire:${this.name}`); return { name: this.name } }
    async releaseConnection() { events.push(`release:${this.name}`) }
    async query(connection, query) {
      if (query.sql === identitySql) { events.push(`verify:${connection.name}`); return {
        response: { rows: [identities[connection.name]] } } }
      events.push(`execute:${query.sql}`)
      return {}
    }
  }
  const drivers = { pg: new Driver('pg'), pgLog: new Driver('pgLog') }
  const db = { manager: { get: (name) => ({ config: { connection: configs[name] } }) },
    connection: (name) => ({ getWriteClient: () => ({ client: drivers[name] }) }) }
  return { db, configs, identities, drivers, events }
}

test.group('Database safety driver and cleanup lifecycle (inert connections)', () => {
  test('configuration mismatch stops before connecting', async ({ assert }) => {
    const f = fixture()
    f.configs.pgLog.database = 'budget'
    await assert.rejects(() => installDatabaseSafety(f.db))
    assert.deepEqual(f.events, [])
  })
  test('every destructive statement including inherited transaction query reruns both identities',
    async ({ assert }) => {
    const f = fixture()
    const guard = await installDatabaseSafety(f.db)
    try {
      f.events.length = 0
      const transaction = Object.create(Object.getPrototypeOf(f.drivers.pg))
      await transaction.query({ name: 'pg' }, { sql: 'DELETE FROM fixture' })
      assert.deepEqual(f.events, ['verify:pg', 'verify:pgLog', 'verify:pg',
        'execute:DELETE FROM fixture'])
      f.events.length = 0
      // A later cleanup has its own check; setup verification is not reused.
      await f.drivers.pgLog.query({ name: 'pgLog' }, { sql: 'DROP TABLE fixture' })
      assert.deepEqual(f.events, ['verify:pg', 'verify:pgLog', 'verify:pgLog',
        'execute:DROP TABLE fixture'])
    } finally { await guard.close() }
  })
  test('authenticated user mismatch blocks destructive execution', async ({ assert }) => {
    const f = fixture()
    const guard = await installDatabaseSafety(f.db)
    try {
      f.events.length = 0
      f.identities.pg.authenticated_user = 'foreign_role'
      await assert.rejects(() => f.drivers.pg.query({ name: 'pg' }, { sql: 'DELETE FROM fixture' }))
      assert.isFalse(f.events.some(event => event.startsWith('execute:')))
    } finally { await guard.close() }
  })
  test('changed live identity blocks later cleanup independently', async ({ assert }) => {
    const f = fixture()
    const guard = await installDatabaseSafety(f.db)
    try {
      f.events.length = 0
      f.identities.pgLog.peer = '10.0.0.1'
      await assert.rejects(() => f.drivers.pg.query({ name: 'pg' }, { sql: 'TRUNCATE fixture' }))
      assert.isFalse(f.events.some((event) => event.startsWith('execute:')))
    } finally { await guard.close() }
  })
})
