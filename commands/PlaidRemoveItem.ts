import env from '#start/env'
import Institution from '#app/Models/Institution';
import Budget from '#models/Budget';
import db from '@adonisjs/lucid/services/db';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class PlaidGetItem extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:remove-item'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Removes the institution with the provided access token'

  @args.string({ description: 'Access token of the item to remove' })
  public accessToken: string
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  public async run (): Promise<void> {
    const environmentRegEx = new RegExp(`access-${env.get('PLAID_ENV')}.+`)

    try {
      if (this.accessToken.match(environmentRegEx)) {
        // Discover only identity/scope before waiting; reload mutation authority after the gate.
        const selection = await Institution.query()
          .select('id', 'budgetId')
          .where('accessToken', this.accessToken)
          .firstOrFail();

        await db.transaction(async (trx) => {
          await Budget.query({ client: trx })
            .where('id', selection.budgetId)
            .forUpdate()
            .firstOrFail();

          const institution = await Institution.query({ client: trx })
            .where('id', selection.id)
            .where('budgetId', selection.budgetId)
            .where('accessToken', this.accessToken)
            .firstOrFail();

          this.logger.info(`Removing item for ${institution.name ?? 'unknown'}`);

          const plaidClient = await this.app.container.make('plaid')

          if (!institution.institutionId) {
            throw new Error('institutionId is null')
          }

          const item = await plaidClient.removeItem(this.accessToken, institution.institutionId);
          this.logger.info(JSON.stringify(item, null, 2));

          institution.accessToken = null;
          institution.plaidItemId = null;
          await institution.save();
        });
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
