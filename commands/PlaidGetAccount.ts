import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';
import { AccountsGetResponse } from 'plaid';

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

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command
     */
    loadApp: true,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process
     */
    stayAlive: false,
  }

  public async run (): Promise<void> {
    let account: AccountsGetResponse | null = null;

    if (this.accountIds[0] === 'all') {
      account = await plaidClient.getAccounts(this.accessToken);
    }
    else {
      account = await plaidClient.getAccounts(this.accessToken, {
        account_ids: this.accountIds,
      });
    }

    this.logger.info(JSON.stringify(account, null, 2));
  }
}
