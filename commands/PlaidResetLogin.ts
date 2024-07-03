import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';
import Institution from 'App/Models/Institution';

export default class PlaidResetLogin extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:reset-login'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Resets the login for the institution with the provided access token'

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
    const institution = await Institution.findByOrFail('accessToken', this.accessToken);

    await plaidClient.resetLogin(institution);
  }
}
