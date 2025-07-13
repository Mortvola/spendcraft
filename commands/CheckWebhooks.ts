import type Institution from '#app/Models/Institution'
import env from '#start/env'
import { BaseCommand } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class CheckWebhooks extends BaseCommand {
  environmentRegEx: RegExp;

  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:webhooks'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Updates webhooks for each item'
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  private async updateWebhook(
    institution: Institution,
  ): Promise<void> {
    const hook = env.get('PLAID_WEBHOOK');

    if (hook) {
      if (institution.accessToken) {
        if (institution.accessToken.match(this.environmentRegEx)) {
          this.logger.info(`checking webhook for ${institution.plaidItemId}`);
          try {
            const plaidClient = await this.app.container.make('plaid')
            const { item } = await plaidClient.getItem(institution);

            if (item.webhook !== hook) {
              const response = await plaidClient.updateItemWebhook(institution, hook);
              this.logger.info(`updated webhook for ${institution.plaidItemId}: old: ${item.webhook}, new: ${response.item.webhook}`);
            }
          }
          catch (error) {
            this.logger.error(`updateItemWebhook failed: ${error.message}`);
          }
        }
        else {
          this.logger.info(`skipping ${institution.plaidItemId} because it is not in the current environment`);
        }
      }
    }
    else {
      this.logger.error('PLAID_WEBHOOK variable not set');
    }
  }

   
  public async run (): Promise<void> {
    this.environmentRegEx = new RegExp(`access-${env.get('PLAID_ENV')}.+`)

    const { default: Institution  } = await import('#models/Institution')
  
    const institutions = await Institution.all();

    await Promise.all(institutions.map(async (i) => this.updateWebhook(i)));
  }
}
