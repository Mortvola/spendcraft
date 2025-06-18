import Institution from '#app/Models/Institution';
import * as Plaid from 'plaid';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class PlaidGetAccount extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:get-account'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Retrieves the account with the provided access token and account ID'

  @args.string({ description: 'Access token of the item to retrieve' })
  public accessToken: string

  @args.spread()
  public accountIds: string[];
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  public async run (): Promise<void> {
    let account: Plaid.AccountsGetResponse | null = null;

    const institution = await Institution.findByOrFail('accessToken', this.accessToken)

    const plaidClient = await this.app.container.make('plaid')

    if (this.accountIds[0] === 'all') {
      account = await plaidClient.getAccounts(institution);
    }
    else {
      account = await plaidClient.getAccounts(institution, {
        account_ids: this.accountIds,
      });
    }

    this.logger.info(JSON.stringify(account, null, 2));
  }
}
