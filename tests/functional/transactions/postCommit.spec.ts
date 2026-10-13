import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'


test.group('Installed rollback completion behavior', () => {
  test('rollback after commit and repeated rollback record installed behavior without undoing commit', async ({ assert }) => {
    const trx = await db.transaction()
    try {
      const budget = await Budget.create({}, { client: trx })
      await trx.commit()
      const results: string[] = []
      for (let i = 0; i < 2; i++) {
        try { await trx.rollback(); results.push('resolved') }
        catch (error) { results.push(error instanceof Error ? error.message : String(error)) }
        assert.isTrue(trx.isCompleted)
      }
      assert.deepEqual(results, ['resolved', 'resolved'])
      assert.isNotNull(await Budget.find(budget.id))
      console.log(JSON.stringify({ scenario: 'rollback-after-commit', results }))
    } finally { if (!trx.isCompleted) await trx.rollback() }
    const rolledBack = await db.transaction()
    await rolledBack.rollback()
    let repeated: string
    try { await rolledBack.rollback(); repeated = 'resolved' }
    catch (error) { repeated = error instanceof Error ? error.message : String(error) }
    assert.equal(repeated, 'resolved')
    assert.isTrue(rolledBack.isCompleted)
    console.log(JSON.stringify({ scenario: 'rollback-after-rollback', result: repeated }))
  })

})
