import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';

export default class PlaidGetAccount extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:get-account-transactions'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Retrieves an accounts transactions'

  @args.string({ description: 'Access token of the item to retrieve' })
  public accessToken: string

  @args.string({ description: 'Account ID of the account to retreive' })
  public accountId: string

  @args.string({ description: 'Transation period start date (YYYY-MM-DD)' })
  public startDate: string

  @args.string({ description: 'Transation period end date (YYYY-MM-DD)' })
  public endDate: string

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
    const account = await plaidClient.getTransactions(
      this.accessToken,
      this.startDate,
      this.endDate,
      {
        account_ids: [this.accountId],
      },
    );
    this.logger.info(JSON.stringify(account, null, 2));
  }
}
