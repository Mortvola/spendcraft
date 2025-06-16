import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class PlaidSearchInstitutions extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:search-institutions'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Search for an institution by name'

  @args.string({ description: 'String to search for.' })
  public query: string
    static options: CommandOptions = {
          loadApp: true,
          staysAlive: false,
        };

  public async run() {
    const { default: plaidClient } = await import('@ioc:Plaid');

    const response = await plaidClient.searchInstitutions(this.query);

    console.log(response);

    this.logger.info('Hello world!')
  }
}
