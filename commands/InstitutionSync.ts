import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import Database from '@ioc:Adonis/Lucid/Database';
import Institution from 'App/Models/Institution';
import Logger from '@ioc:Adonis/Core/Logger';

export default class InstitutionSync extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'institution:sync'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

  @args.string({ description: 'Item ID of the item to sync' })
  public itemId: string

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
    stayAlive: false,
  }

  // eslint-disable-next-line class-methods-use-this
  public async run() {
    const trx = await Database.transaction();

    try {
      const institution = await Institution.findByOrFail('plaidItemId', this.itemId, { client: trx });

      await institution.syncUpdate()

      await trx.commit();
    }
    catch (error) {
      Logger.error({ err: error }, `sync failed, item id: ${this.itemId}`);

      await trx.rollback();
    }

    console.log('Finished')
  }
}
