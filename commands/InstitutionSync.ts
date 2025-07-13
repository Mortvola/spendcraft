import db from '@adonisjs/lucid/services/db';
import Institution from '#app/Models/Institution';
import logger from '@adonisjs/core/services/logger';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

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
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };
   
  public async run() {
    const trx = await db.transaction();

    try {
      const institution = await Institution.findByOrFail('plaidItemId', this.itemId, { client: trx });

      await institution.syncUpdate()

      await trx.commit();
    }
    catch (error) {
      logger.error({ err: error }, `sync failed, item id: ${this.itemId}`);

      await trx.rollback();
    }

    console.log('Finished')
  }
}
