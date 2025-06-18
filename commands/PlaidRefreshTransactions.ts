import Institution from '#app/Models/Institution'
import env from '#start/env'
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class PlaidRefreshTransactions extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:refresh-transactions'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Refreshes an items transactions'

  @args.string({ description: 'Item id of the item for which to refresh the transactions' })
  public itemId: string
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  public async run() {
    const institution = await Institution.findByOrFail('plaidItemId', this.itemId);

    const environmentRegEx = new RegExp(`access-${env.get('PLAID_ENV')}.+`)

    try {
      if (institution.accessToken === null) {
        throw new Error('Access token is null')
      }

      if (institution.accessToken.match(environmentRegEx)) {
        const plaidClient = await this.app.container.make('plaid')

        await plaidClient.refreshTransactions(
          institution,
        );
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
