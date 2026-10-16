import { test } from '@japa/runner'
import { configuredTarget, liveIdentity, destructiveSql } from '../helpers/databaseSafety.js'

test.group('Test database safety without database access', () => {
  test('accepts only configured authorized endpoint', ({ assert }) => {
    assert.deepEqual(configuredTarget({ host: 'localhost', port: 5432, database: 'spendcraft_test' }),
      { host: 'localhost', port: 5432, database: 'spendcraft_test' })
  })
  test('rejects mismatched or ambiguous configured targets').with([
    {}, { host: 'localhost', port: 5433, database: 'spendcraft_test' },
    { host: 'remote', port: 5432, database: 'spendcraft_test' },
    { host: 'localhost', port: 5432, database: 'spendcraft_sandbox' },
    { host: 'localhost', port: 5432, database: 'budget' },
    { host: 'localhost', port: 5432, database: 'production' },
  ]).run(({ assert }, value) => { assert.throws(() => configuredTarget(value)) })
  test('positively recognizes loopback renderings').with(['127.0.0.1', '::1', '::1/128', '::ffff:127.0.0.1'])
    .run(({ assert }, address) => { assert.equal(liveIdentity({ database: 'spendcraft_test', port: 5432, server: address, peer: address }).database, 'spendcraft_test') })
  test('fails closed on live identity mismatch').with([
    { database: 'budget', port: 5432, server: '127.0.0.1', peer: '127.0.0.1' },
    { database: 'spendcraft_test', port: 5433, server: '127.0.0.1', peer: '127.0.0.1' },
    { database: 'spendcraft_test', port: 5432, server: '10.0.0.1', peer: '127.0.0.1' },
    { database: 'spendcraft_test', port: 5432, server: '127.0.0.1', peer: null },
  ]).run(({ assert }, value) => { assert.throws(() => liveIdentity(value)) })
  test('covers bootstrap, cleanup, schema and nested destructive SQL').with([
    'TRUNCATE applications CASCADE', 'DELETE FROM accounts', 'ALTER TABLE accounts DROP CONSTRAINT test',
    'DROP TABLE IF EXISTS test', 'CREATE TEMP TABLE test (id int)', 'WITH x AS (DELETE FROM accounts RETURNING *) SELECT * FROM x',
    '/* cleanup */ DELETE FROM accounts', 'SELECT 1; DROP TABLE test', 'UPDATE accounts SET balance=0',
  ]).run(({ assert }, sql) => { assert.isTrue(destructiveSql(sql)) })
})
