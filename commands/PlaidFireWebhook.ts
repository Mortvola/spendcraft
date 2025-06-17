import env from '#start/env'
import Institution from '#app/Models/Institution';
import { SandboxItemFireWebhookRequestWebhookCodeEnum } from 'plaid';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

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
    static options: CommandOptions = {
          loadApp: true,
          staysAlive: false,
        };

  public async run (): Promise<void> {
    const institution = await Institution.findByOrFail('plaidItemId', this.itemId);

    const environmentRegEx = new RegExp(`access-${env.get('PLAID_ENV')}.+`)

    try {
      if (institution.accessToken === null) {
        throw new Error('Access token is null')
      }

      console.log(institution.accessToken);

      if (institution.accessToken.match(environmentRegEx)) {
        const plaidClient = await this.app.container.make('plaid')
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
