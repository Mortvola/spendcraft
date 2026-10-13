import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import RecurrenceMigration from '../../../database/migrations/1792000000000_categories_recurrence_range_check.js'

test.group('Recurrence range migration', () => {
  test('real up/down methods enforce boundaries and preserve column definition', async ({ assert }) => {
    const trx = await db.transaction()
    try {
      // PostgreSQL resolves unqualified categories to this connection-local temporary table.
      // The real migration runs unchanged; public.categories and migration bookkeeping are untouched.
      await trx.rawQuery('CREATE TEMP TABLE categories (id integer PRIMARY KEY CHECK (id > 0), recurrence integer NOT NULL DEFAULT 1)')
      assert.equal((await trx.rawQuery("SELECT relpersistence FROM pg_class WHERE oid = 'categories'::regclass")).rows[0].relpersistence, 't')
      const column = async () => (await trx.rawQuery(`SELECT a.atttypid::regtype::text AS type, a.attnotnull AS not_null,
        pg_get_expr(d.adbin, d.adrelid) AS default_value FROM pg_attribute a
        JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'categories'::regclass AND a.attname = 'recurrence'`)).rows[0]
      const before = await column()
      assert.deepEqual(before, { type: 'integer', not_null: true, default_value: '1' })
      await new RecurrenceMigration(trx, 'isolated-real-recurrence-up').execUp()
      const check = (await trx.rawQuery("SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'categories'::regclass AND conname = 'categories_recurrence_range_check'")).rows[0]
      assert.deepEqual(check, { conname: 'categories_recurrence_range_check', convalidated: true })
      await trx.table('categories').insert([{ id: 1, recurrence: 1 }, { id: 2, recurrence: 360 }])
      for (const recurrence of [0, 361, -1]) {
        let failure: unknown
        try { await trx.transaction(async (child) => { await child.table('categories').insert({ id: 3, recurrence }) }) }
        catch (error) { failure = error }
        if (!(failure instanceof Error) || !('code' in failure)) throw new Error('Expected CHECK violation')
        assert.equal(failure.code, '23514')
      }
      assert.deepEqual(await column(), before)
      const constraintsBeforeDown = (await trx.rawQuery("SELECT conname FROM pg_constraint WHERE conrelid = 'categories'::regclass ORDER BY conname")).rows
      await new RecurrenceMigration(trx, 'isolated-real-recurrence-down').execDown()
      const constraintsAfterDown = (await trx.rawQuery("SELECT conname FROM pg_constraint WHERE conrelid = 'categories'::regclass ORDER BY conname")).rows
      assert.deepEqual(constraintsAfterDown, constraintsBeforeDown.filter((row: { conname: string }) => row.conname !== 'categories_recurrence_range_check'))
      assert.deepEqual(await column(), before)
      assert.deepEqual(await trx.from('categories').orderBy('id'), [{ id: 1, recurrence: 1 }, { id: 2, recurrence: 360 }])
    } finally { if (!trx.isCompleted) await trx.rollback() }
  })

  test('real up rejects dirty isolated data without modifying it', async ({ assert }) => {
    const trx = await db.transaction()
    try {
      await trx.rawQuery('CREATE TEMP TABLE categories (id integer PRIMARY KEY, recurrence integer NOT NULL DEFAULT 1)')
      assert.equal((await trx.rawQuery("SELECT relpersistence FROM pg_class WHERE oid = 'categories'::regclass")).rows[0].relpersistence, 't')
      await trx.table('categories').insert({ id: 1, recurrence: 0 })
      let failure: unknown
      try { await trx.transaction(async (child) => { await new RecurrenceMigration(child, 'isolated-dirty-recurrence-up').execUp() }) }
      catch (error) { failure = error }
      if (!(failure instanceof Error) || !('code' in failure)) throw new Error('Expected migration CHECK violation')
      assert.equal(failure.code, '23514')
      assert.deepEqual(await trx.from('categories'), [{ id: 1, recurrence: 0 }])
      assert.lengthOf((await trx.rawQuery("SELECT conname FROM pg_constraint WHERE conrelid = 'categories'::regclass AND conname = 'categories_recurrence_range_check'")).rows, 0)
    } finally { if (!trx.isCompleted) await trx.rollback() }
  })
})

test.group('Legacy recurrence CHECK design', () => {
  test('isolated NOT VALID constraint preserves legacy rows but enforces new row versions', async ({ assert }) => {
    const table = `recurrence_constraint_probe_${randomUUID().replaceAll('-', '')}`
    const trx = await db.transaction()
    try {
      const version = await trx.rawQuery("select current_setting('server_version') as version")
      await trx.rawQuery(`CREATE TEMP TABLE "${table}" (id integer PRIMARY KEY, recurrence integer NOT NULL, label text)`)
      await trx.table(table).insert({ id: 1, recurrence: 0, label: 'Legacy' })
      await trx.rawQuery(`ALTER TABLE "${table}" ADD CONSTRAINT recurrence_range CHECK (recurrence BETWEEN 1 AND 360) NOT VALID`)
      assert.equal((await trx.from(table).where('id', 1).first()).recurrence, 0)

      async function rejected(sql: string) {
        let observed: unknown
        try { await trx.transaction(async (savepoint) => { await savepoint.rawQuery(sql) }) }
        catch (error) { observed = error }
        assert.instanceOf(observed, Error)
        if (!(observed instanceof Error) || !('code' in observed)) throw new Error('Expected PostgreSQL constraint error')
        assert.equal(observed.code, '23514')
      }

      await rejected(`INSERT INTO "${table}" VALUES (2, -1, 'Invalid new row')`)
      await rejected(`UPDATE "${table}" SET label = 'Unrelated edit' WHERE id = 1`)
      await rejected(`UPDATE "${table}" SET recurrence = 361 WHERE id = 1`)
      await trx.table(table).insert([{ id: 3, recurrence: 1, label: 'Valid' }, { id: 4, recurrence: 360, label: 'Valid' }])
      await rejected(`ALTER TABLE "${table}" VALIDATE CONSTRAINT recurrence_range`)
      // Test fixture repair only: do not infer this is a legitimate production cleanup policy.
      await trx.from(table).where('id', 1).update({ recurrence: 3 })
      await trx.rawQuery(`ALTER TABLE "${table}" VALIDATE CONSTRAINT recurrence_range`)
      const constraint = await trx.rawQuery('select convalidated from pg_constraint where conrelid = ?::regclass and conname = ?', [table, 'recurrence_range'])
      assert.isTrue(constraint.rows[0].convalidated)
      await rejected(`INSERT INTO "${table}" VALUES (5, 361, 'Invalid after validation')`)
      await rejected(`UPDATE "${table}" SET recurrence = 0 WHERE id = 1`)
      await trx.rawQuery(`ALTER TABLE "${table}" DROP CONSTRAINT recurrence_range`)
      console.log(JSON.stringify({ scenario: 'isolated NOT VALID CHECK', serverVersion: version.rows[0].version,
        legacyPreserved: true, invalidInsertRejected: true, unrelatedLegacyUpdateRejected: true,
        validationFailedBeforeFixtureRepair: true, validationSucceededAfterFixtureRepair: true,
        validBoundaryInsertsSucceeded: true, repairUpdateSucceeded: true, postValidationEnforcement: true }))
    } finally {
      if (!trx.isCompleted) await trx.rollback()
    }
    const objects = await db.from('pg_class').where('relname', table)
    assert.lengthOf(objects, 0)
  })
})
