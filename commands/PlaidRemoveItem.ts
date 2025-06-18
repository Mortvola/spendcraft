import env from '#start/env'
import Institution from '#app/Models/Institution';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

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
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  public async run (): Promise<void> {
    const environmentRegEx = new RegExp(`access-${env.get('PLAID_ENV')}.+`)

    try {
      if (this.accessToken.match(environmentRegEx)) {
        const institution = await Institution.findBy('accessToken', this.accessToken);

        this.logger.info(`Removing item for ${institution?.name ?? 'unknown'}`);

        const plaidClient = await this.app.container.make('plaid')

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
