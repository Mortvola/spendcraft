import plaidClient from '@ioc:Plaid';
import env from '#start/env'
import Institution from '#app/Models/Institution';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { flags } from "@adonisjs/core/ace";

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

  @flags.boolean({ alias: 'f', description: 'Updates item id' })
  public fix: boolean

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
    const environmentRegEx = new RegExp(`access-${env.get('PLAID_ENV')}.+`)

    try {
      if (this.accessToken.match(environmentRegEx)) {
        const institiution = await Institution.findByOrFail('accessToken', this.accessToken)

        const response = await plaidClient.getItem(institiution);
        this.logger.info(JSON.stringify(response, null, 2));

        if (this.fix) {
          const institution = await Institution.findBy('accessToken', this.accessToken);

          if (institution && institution.plaidItemId !== response.item.item_id) {
            this.logger.info(`Changing item id from ${institution.plaidItemId} to ${response.item.item_id}`);

            institution.plaidItemId = response.item.item_id;

            await institution.save();
          }
          else {
            this.logger.info('Items IDs are the same');
          }
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
