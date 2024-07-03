import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';
import Env from '@ioc:Adonis/Core/Env'
import Institution from 'App/Models/Institution';
import { SandboxItemFireWebhookRequestWebhookCodeEnum } from 'plaid';

export default class PlaidFireWebhook extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:fire-webhook'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Fires an item webhook'

  @args.string({ description: 'Item id of the item for which to fire the webhook' })
  public itemId: string

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
    const institution = await Institution.findByOrFail('plaidItemId', this.itemId);

    const environmentRegEx = new RegExp(`access-${Env.get('PLAID_ENV')}.+`)

    try {
      if (institution.accessToken === null) {
        throw new Error('Access token is null')
      }

      console.log(institution.accessToken);

      if (institution.accessToken.match(environmentRegEx)) {
        await plaidClient.sandboxItemFireWebhook(
          institution,
          SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
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
