import { test } from '@japa/runner'
import { mock } from 'node:test'
import ace from '@adonisjs/core/services/ace'
import drive from '@adonisjs/drive/services/main'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import { AccountType, TrackingType } from '#common/ResponseTypes'
import { DateTime } from 'luxon'
import OfxUpload from '../../../commands/OfxUpload.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

function signal() {
  let release: () => void = () => { throw new Error('Signal not initialized') }
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
let sequence = 0

test.group('OFX command transaction lifecycle', (group) => {
  let transactions: TransactionClientContract[]
  let commits: number
  let rollbacks: number
  let events: string[]
  group.each.setup(() => {
    transactions = []; commits = 0; rollbacks = 0; events = []
    const original = db.transaction.bind(db)
    const capture = mock.method(db, 'transaction', async () => {
      const trx = await original(); transactions.push(trx); events.push('transaction-acquired')
      const commit = trx.commit.bind(trx)
      const rollback = trx.rollback.bind(trx)
      mock.method(trx, 'commit', async () => { commits++; events.push('commit'); await commit() })
      mock.method(trx, 'rollback', async () => { rollbacks++; await rollback() })
      return trx
    })
    const disk = drive.use('fs')
    // A nonempty header-only document exercises command ownership without parsing/import work.
    const file = mock.method(disk, 'get', async () => Buffer.from('OFXHEADER:100'))
    return async () => {
      capture.mock.restore(); file.mock.restore()
    }
  })

  test('pending username input has no transaction', async ({ assert, cleanup }) => {
    const command = await ace.create(OfxUpload, ['fixture.ofx'])
    const entered = signal()
    const release = signal()
    const prompt = mock.method(command.prompt, 'ask', async () => {
      entered.release(); await release.promise; events.push('username-resolved'); return 'missing-ofx-lifecycle-user'
    })
    cleanup(() => prompt.mock.restore())
    let completed = false
    const running = command.run().then(() => { completed = true })
    try {
      await entered.promise
      assert.isFalse(completed)
      assert.lengthOf(transactions, 0)
      assert.equal(commits, 0); assert.equal(rollbacks, 0)
    } finally { release.release(); await running }
    assert.deepEqual(events, ['username-resolved', 'transaction-acquired'])
    assert.isTrue(transactions[0].isCompleted)
    assert.equal(rollbacks, 1)
  })

  test('username rejection acquires no transaction, including Ace execution')
    .with(['run', 'exec']).run(async ({ assert, cleanup }, entry) => {
      const command = await ace.create(OfxUpload, ['fixture.ofx'])
      const failure = new Error('Injected username prompt rejection')
      const prompt = mock.method(command.prompt, 'ask', async () => { events.push('username-rejected'); throw failure })
      cleanup(() => prompt.mock.restore())
      if (entry === 'run') {
        let observed: unknown
        try { await command.run() } catch (error) { observed = error }
        assert.strictEqual(observed, failure)
      } else {
        await command.exec()
        assert.strictEqual(command.error, failure)
        assert.equal(command.exitCode, 1)
      }
      assert.lengthOf(transactions, 0)
      assert.deepEqual(events, ['username-rejected'])
      assert.equal(commits, 0); assert.equal(rollbacks, 0)
    })

  test('resolved username and selections reach normal commit', async ({ assert, cleanup }) => {
    // Create fixtures before observing command transactions.
    const budget = await Budget.create({})
    const user = await budget.related('users').create({ username: `ofx-command-${++sequence}`,
      email: `ofx-command-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: `OFX command bank ${sequence}` })
    const account = await institution.related('accounts').create({ name: `OFX command card ${sequence}`,
      balance: 0, type: AccountType.Credit, subtype: 'credit card', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false })
    const command = await ace.create(OfxUpload, ['fixture.ofx'])
    const ask = mock.method(command.prompt, 'ask', async () => { events.push('username-resolved'); return user.username })
    const choice = mock.method(command.prompt, 'choice', async (title: string) => title === 'Select the institution' ? institution.name : account.name)
    cleanup(() => { ask.mock.restore(); choice.mock.restore() })
    await command.run()
    assert.lengthOf(transactions, 1)
    assert.isTrue(transactions[0].isCompleted)
    assert.equal(commits, 1); assert.equal(rollbacks, 0)
    assert.deepEqual(events, ['username-resolved', 'transaction-acquired', 'commit'])
  })

  test('post-prompt failure is caught and completes through awaited rollback', async ({ assert, cleanup }) => {
    const command = await ace.create(OfxUpload, ['fixture.ofx'])
    const logged: unknown[] = []
    const log = mock.method(console, 'log', (...values: unknown[]) => { logged.push(...values) })
    cleanup(() => log.mock.restore())
    const prompt = mock.method(command.prompt, 'ask', async () => 'missing-ofx-lifecycle-user')
    cleanup(() => prompt.mock.restore())
    await command.run()
    assert.lengthOf(transactions, 1)
    assert.isTrue(transactions[0].isCompleted)
    assert.equal(commits, 0); assert.equal(rollbacks, 1)
    assert.include(logged, 'Username not found')
  })
})
