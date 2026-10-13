import { test } from '@japa/runner'
import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

test.group('Historical categories migration transaction binding characterization', () => {
  test('writes through the schema client distinguish savepoint and independent ownership')
    .with(['enabled-nested-rollback', 'enabled-outer-rollback', 'disabled-manual-rollback'])
    .run(async ({ assert }, scenario) => {
      const table = `migration_binding_probe_${randomUUID().replaceAll('-', '')}`
      await db.connection().schema.createTable(table, (builder) => { builder.integer('id').primary() })
      let outer: TransactionClientContract | undefined
      let manual: TransactionClientContract | undefined
      let parentPid: number | undefined
      let manualPid: number | undefined
      let parentWasTransaction = false
      let parentRowsAfterManualCompletion: { id: number }[] = []
      try {
        const enabled = scenario !== 'disabled-manual-rollback'
        if (enabled) outer = await db.transaction()
        // These are the two client kinds selected by installed MigrationRunner.getClient().
        const schemaClient = outer ?? db.connection()
        class Probe extends BaseSchema {
          async up() {
            this.defer(async () => {
              parentWasTransaction = this.db.isTransaction
              manual = await this.db.transaction()
              manualPid = (await manual.rawQuery('select pg_backend_pid() as pid')).rows[0].pid
              parentPid = (await this.db.rawQuery('select pg_backend_pid() as pid')).rows[0].pid
              // Deliberately reproduce the historical use of this.db, not manual.
              await this.db.table(table).insert({ id: 1 })
              const visible = await this.db.from(table).select('id')
              assert.deepEqual(visible, [{ id: 1 }])
              if (scenario === 'enabled-outer-rollback') await manual.commit()
              else await manual.rollback()
              parentRowsAfterManualCompletion = await this.db.from(table).select('id')
            })
          }
        }
        assert.isTrue(await new Probe(schemaClient, 'test-only-binding-probe').execUp())
        assert.isTrue(manual?.isCompleted)
        assert.equal(parentWasTransaction, enabled)
        if (enabled) assert.equal(parentPid, manualPid)
        else assert.notEqual(parentPid, manualPid)
        if (scenario === 'enabled-nested-rollback') {
          assert.deepEqual(parentRowsAfterManualCompletion, [])
          await outer?.commit()
        } else if (scenario === 'enabled-outer-rollback') {
          assert.deepEqual(parentRowsAfterManualCompletion, [{ id: 1 }])
          await outer?.rollback()
        } else assert.deepEqual(parentRowsAfterManualCompletion, [{ id: 1 }])
        const persisted = await db.from(table).select('id')
        assert.deepEqual(persisted, enabled ? [] : [{ id: 1 }])
        console.log(JSON.stringify({ scenario, parentWasTransaction, parentPid, manualPid,
          parentRowsAfterManualCompletion, persisted }))
      } finally {
        if (manual && !manual.isCompleted) await manual.rollback()
        if (outer && !outer.isCompleted) await outer.rollback()
        await db.connection().schema.dropTableIfExists(table)
      }
    })
})
