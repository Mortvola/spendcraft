import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';
import Env from '@ioc:Adonis/Core/Env'
import Institution from 'App/Models/Institution';

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
    const environmentRegEx = new RegExp(`access-${Env.get('PLAID_ENV')}.+`)

    try {
      if (this.accessToken.match(environmentRegEx)) {
        const institution = await Institution.findBy('accessToken', this.accessToken);

        this.logger.info(`Removing item for ${institution?.name ?? 'unknown'}`);

        const item = await plaidClient.removeItem(this.accessToken, institution?.institutionId);
        this.logger.info(JSON.stringify(item, null, 2));

        if (institution) {
          institution.accessToken = null;
          institution.plaidItemId = null;
          await institution.save();
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
