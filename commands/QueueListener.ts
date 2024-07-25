import { BaseCommand } from '@adonisjs/core/build/standalone'
import BullMQ from '@ioc:Adonis/Addons/BullMQ'
import applePushNotifications from '@ioc:ApplePushNotifications';
import Institution from 'App/Models/Institution';
import Budget from 'App/Models/Budget';
import { PlaidWebHookProps, QueueNamesEnum } from 'Contracts/QueueInterfaces'
import Database from '@ioc:Adonis/Lucid/Database';
import Logger from '@ioc:Adonis/Core/Logger';

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
    Logger.info('Starting queue listener...')
    BullMQ.worker<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook, async (job) => {
      Logger.info(`Syncing item ${job.data.itemId}`)

      const trx = await Database.transaction();

      try {
        const institution = await Institution.findByOrFail('plaidItemId', job.data.itemId, { client: trx });

        await institution.syncUpdate()

        await trx.commit();

        const budget = await Budget.findOrFail(institution.budgetId);

        await applePushNotifications.sendPushNotifications(budget);
      }
      catch (error) {
        Logger.error({ err: error }, `sync update failed, item id: ${job.data.itemId}`);

        await trx.rollback();
      }

      return job.data
    })

    Logger.info('queue listener started.')
  }
}
