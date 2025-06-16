import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';
import Institution from '#app/Models/Institution'
import Env from '@ioc:Adonis/Core/Env'

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

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command. Don't forget to call `node ace generate:manifest` 
     * afterwards.
     */
    loadApp: true,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process. Don't forget to call 
     * `node ace generate:manifest` afterwards.
     */
    stayAlive: false,
  }

  public async run() {
    const institution = await Institution.findByOrFail('plaidItemId', this.itemId);

    const environmentRegEx = new RegExp(`access-${Env.get('PLAID_ENV')}.+`)

    try {
      if (institution.accessToken === null) {
        throw new Error('Access token is null')
      }

      if (institution.accessToken.match(environmentRegEx)) {
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
