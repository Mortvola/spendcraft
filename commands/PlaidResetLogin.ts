import Institution from '#app/Models/Institution';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class PlaidResetLogin extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'plaid:reset-login'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Resets the login for the institution with the provided access token'

  @args.string({ description: 'Access token of the item to reset' })
  public accessToken: string
    static options: CommandOptions = {
          loadApp: true,
          staysAlive: false,
        };

  public async run (): Promise<void> {
    const institution = await Institution.findByOrFail('accessToken', this.accessToken);

    const plaidClient = await this.app.container.make('plaid')

    await plaidClient.resetLogin(institution);
  }
}
