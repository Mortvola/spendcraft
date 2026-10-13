import { test } from '@japa/runner'
import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import { mock } from 'node:test'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

function gate() {
  let release: () => void = () => { throw new Error('Gate not initialized') }
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

test.group('Historical migration completion ordering', () => {
  test('deferred callback waits for savepoint completion')
    .with([{ operation: 'commit' }, { operation: 'rollback' }])
    .run(async ({ assert }, scenario) => {
      const table = `migration_lifecycle_probe_${randomUUID().replaceAll('-', '')}`
      await db.connection().schema.createTable(table, (builder) => { builder.integer('id').primary() })
      let outer: TransactionClientContract | undefined
      let child: TransactionClientContract | undefined
      let completion: Promise<void> | undefined
      const entered = gate()
      const release = gate()
      let resolved = false
      let callerContinued = false
      const errors: unknown[] = []
      const events: string[] = []
      const failure = new Error('Injected isolated migration callback failure')
      try {
        outer = await db.transaction()
        class Probe extends BaseSchema {
          async up() {
            this.defer(async () => {
              child = await this.db.transaction()
              const complete = scenario.operation === 'commit' ? child.commit.bind(child) : child.rollback.bind(child)
              mock.method(child, scenario.operation === 'commit' ? 'commit' : 'rollback', () => {
                entered.release()
                completion = (async () => { await release.promise; await complete(); events.push('savepoint-completed') })()
                return completion
              })
              try {
                await child.table(table).insert({ id: 1 })
                if (scenario.operation === 'rollback') throw failure
                await child.commit()
              } catch (error) {
                errors.push(error)
                await child.rollback()
              }
            })
          }
        }
        // Uses the installed deferred-schema executor and an outer transaction,
        // but deliberately does not invoke the runner or migration bookkeeping.
        const execution = new Probe(outer, 'test-only-lifecycle-probe').execUp().then((result) => {
          resolved = true; callerContinued = true; events.push('execUp-resolved'); return result
        })
        await entered.promise
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.isFalse(child?.isCompleted)
        assert.isFalse(resolved)
        assert.isFalse(callerContinued)
        release.release()
        await completion
        assert.isTrue(await execution)
        assert.isTrue(child?.isCompleted)
        assert.deepEqual(events, ['savepoint-completed', 'execUp-resolved'])
        if (scenario.operation === 'rollback') assert.strictEqual(errors[0], failure)
        await outer.commit()
        const rows = await db.from(table).select('id')
        assert.deepEqual(rows, scenario.operation === 'commit' ? [{ id: 1 }] : [])
      } finally {
        release.release()
        if (completion) await completion
        if (child && !child.isCompleted) await child.rollback()
        if (outer && !outer.isCompleted) await outer.rollback()
        await db.connection().schema.dropTableIfExists(table)
      }
    })
})
