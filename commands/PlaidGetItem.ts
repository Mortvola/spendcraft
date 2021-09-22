import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';

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
    const item = await plaidClient.getItem(this.accessToken);
    this.logger.info(JSON.stringify(item, null, 2));
  }
}
