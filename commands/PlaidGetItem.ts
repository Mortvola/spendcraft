import env from '#start/env'
import Institution from '#app/Models/Institution';
import Budget from '#models/Budget';
import db from '@adonisjs/lucid/services/db';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { flags } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class PlaidGetItem extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:get-item'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Retrieves the institution with the provided access token'

  @args.string({ description: 'Access token of the item to retreive' })
  public accessToken: string

  @flags.boolean({ alias: 'f', description: 'Updates item id' })
  public fix: boolean
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  public async run (): Promise<void> {
    const environmentRegEx = new RegExp(`access-${env.get('PLAID_ENV')}.+`)

    try {
      if (this.accessToken.match(environmentRegEx)) {
        const selection = await Institution.findByOrFail('accessToken', this.accessToken)

        const plaidClient = await this.app.container.make('plaid')

        const response = await plaidClient.getItem(selection);
        this.logger.info(JSON.stringify(response, null, 2));

        if (this.fix) {
          await db.transaction(async (trx) => {
            await Budget.query({ client: trx })
              .where('id', selection.budgetId)
              .forUpdate()
              .firstOrFail();

            const institution = await Institution.query({ client: trx })
              .where('id', selection.id)
              .where('budgetId', selection.budgetId)
              .where('accessToken', this.accessToken)
              .first();

            if (institution && institution.plaidItemId !== response.item.item_id) {
              this.logger.info(`Changing item id from ${institution.plaidItemId} to ${response.item.item_id}`);

              institution.plaidItemId = response.item.item_id;

              await institution.save();
            }
            else {
              this.logger.info('Items IDs are the same');
            }
          });
        }
      }
      else {
        this.logger.error('Access token and current environment do not match');
      }
    }
    catch (error) {
      this.logger.error(error);
    }
  }
}
