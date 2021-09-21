import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';

export default class PlaidFireWebhook extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:fire-webhook'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Fires an item webhook'

  @args.string({ description: 'Access token of the item to reset' })
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
    await plaidClient.sandboxItemFireWebhook(this.accessToken);
  }
}