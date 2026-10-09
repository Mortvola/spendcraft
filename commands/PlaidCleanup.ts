import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import Cleanup from '#models/PlaidItemCleanup'
import PlaidItemCleanupService from '#services/plaidItemCleanup'

export default class PlaidCleanup extends BaseCommand {
  static commandName = 'plaid:cleanup'
  static description = 'List safe recovery metadata, retry, or explicitly extend cleanup retention'
  static options = { startApp: true }
  @args.string({ description: 'list, retry, or extend' }) declare action: string
  @args.string({ description: 'Cleanup UUID', required: false }) declare cleanupId: string | undefined
  @flags.number({ description: 'Retention extension in days' }) declare days: number | undefined

  async run() {
    if (this.action === 'list') {
      const rows = await Cleanup.query().whereNotIn('status', ['cancelled', 'completed']).orderBy('createdAt').limit(100)
      for (const row of rows) this.logger.info(JSON.stringify(row.serialize()))
      return
    }
    if ((this.action !== 'retry' && this.action !== 'extend') || !this.cleanupId) throw new Error('Use list, retry UUID, or extend UUID --days N')
    const service = new PlaidItemCleanupService()
    await service.administer(this.cleanupId, this.action, this.days)
    if (this.action === 'retry') await service.attempt(this.cleanupId)
    this.logger.info('Cleanup administrative action recorded')
  }
}
