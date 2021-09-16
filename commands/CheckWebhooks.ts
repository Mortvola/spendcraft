import { BaseCommand } from '@adonisjs/core/build/standalone'
import Institution from 'App/Models/Institution'
import Env from '@ioc:Adonis/Core/Env'
import plaidClient from '@ioc:Plaid';

export default class CheckWebhooks extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:webhooks'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Updates webhooks for each item'

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

  private static async updateWebhook(
    institution: Institution,
  ): Promise<void> {
    const hook = Env.get('PLAID_WEBHOOK');

    if (hook) {
      if (institution.accessToken) {
        console.log(`updating ${institution.plaidItemId} webhook to ${hook}`);
        try {
          const response = await plaidClient.updateItemWebhook(institution.accessToken, hook);
          console.log(`new webhook for ${institution.plaidItemId}: ${response.item.webhook}`);
        }
        catch (error) {
          console.log(`updateItemWebhook failed: ${error.message}`);
        }
      }
    }
    else {
      console.log('PLAID_WEBHOOK variable not set');
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async run (): Promise<void> {
    const institutions = await Institution.all();

    await Promise.all(institutions.map(async (i) => CheckWebhooks.updateWebhook(i)));
  }
}
