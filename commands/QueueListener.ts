import Institution from '#app/Models/Institution';
import Budget from '#app/Models/Budget';
import { PlaidWebHookProps, QueueNamesEnum } from '#contracts/QueueInterfaces'
import db from '@adonisjs/lucid/services/db';
import logger from '@adonisjs/core/services/logger';
import { BaseCommand } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";
import app from '@adonisjs/core/services/app';

export default class QueueListener extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'queue:listener'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''
  static options: CommandOptions = {
        startApp: true,
        staysAlive: true,
      };

  // eslint-disable-next-line class-methods-use-this
  public async run() {
    logger.info('Starting queue listener...')

    const bullmq = await app.container.make('bullmq')

    bullmq.worker<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook, async (job) => {
      logger.info(`Syncing item ${job.data.itemId}`)

      const trx = await db.transaction();

      try {
        const institution = await Institution.findByOrFail('plaidItemId', job.data.itemId, { client: trx });

        await institution.syncUpdate()

        await trx.commit();

        try {
          const budget = await Budget.findOrFail(institution.budgetId);

          const applePushNotifications = await this.app.container.make('apn')
          await applePushNotifications.sendPushNotifications(budget);
        }
        catch (error) {
          logger.error({ err: error }, 'push notification failed');
        }
      }
      catch (error) {
        logger.error({ err: error }, `sync update failed, item id: ${job.data.itemId}`);

        await trx.rollback();
      }

      return job.data
    })

    logger.info('queue listener started.')
  }
}
