import { BaseCommand } from '@adonisjs/core/ace'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import PlaidItemCleanupService from '#services/plaidItemCleanup'
import { QueueNamesEnum } from '#contracts/QueueInterfaces'

export default class PlaidCleanupListener extends BaseCommand {
  static commandName = 'plaid:cleanup-listener'
  static description = 'Process durable orphan cleanup and reconcile PostgreSQL due work'
  static options = { startApp: true, staysAlive: true }

  async run() {
    const service = new PlaidItemCleanupService()
    const bull = await app.container.make('bullmq')
    const worker = bull.worker<{ cleanupId: string }, null>(QueueNamesEnum.PlaidItemCleanup, async (job) => {
      await service.attempt(job.data.cleanupId)
      return null
    })
    worker.on('error', () => logger.error('Plaid cleanup worker infrastructure failure'))
    let sweeping = false
    const sweep = async () => {
      if (sweeping) return
      sweeping = true
      try { await service.sweep() }
      catch { logger.error('Plaid cleanup sweep failed; PostgreSQL retains recovery responsibility') }
      finally { sweeping = false }
    }
    const timer = setInterval(() => { void sweep() }, 60_000)
    this.app.terminating(async () => { clearInterval(timer); await worker.close() })
    await sweep()
  }
}
