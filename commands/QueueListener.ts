import BullMQ from '@ioc:Adonis/Addons/BullMQ'
import applePushNotifications from '@ioc:ApplePushNotifications';
import Institution from '#app/Models/Institution';
import Budget from '#app/Models/Budget';
import { PlaidWebHookProps, QueueNamesEnum } from '#contracts/QueueInterfaces'
import db from '@adonisjs/lucid/services/db';
import logger from '@adonisjs/core/services/logger';
import { BaseCommand } from "@adonisjs/core/ace";

// function delay(ms: number) {
//   return new Promise((resolve) => {
//     setTimeout(resolve, ms)
//   });
// }

export default class QueueListener extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'queue:listener'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command. Don't forget to call `node ace generate:manifest` 
     * afterwards.
     */
    loadApp: true,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process. Don't forget to call 
     * `node ace generate:manifest` afterwards.
     */
    stayAlive: true,
  }

  // eslint-disable-next-line class-methods-use-this
  public async run() {
    logger.info('Starting queue listener...')
    BullMQ.worker<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook, async (job) => {
      logger.info(`Syncing item ${job.data.itemId}`)

      const trx = await db.transaction();

      try {
        const institution = await Institution.findByOrFail('plaidItemId', job.data.itemId, { client: trx });

        await institution.syncUpdate()

        await trx.commit();

        const budget = await Budget.findOrFail(institution.budgetId);

        await applePushNotifications.sendPushNotifications(budget);
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
