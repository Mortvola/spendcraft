import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";

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
    const { default: plaidClient } = await import('@ioc:Plaid');

    const response = await plaidClient.searchInstitutions(this.query);

    console.log(response);

    this.logger.info('Hello world!')
  }
}
