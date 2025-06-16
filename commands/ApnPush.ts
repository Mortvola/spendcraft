import Budget from '#app/Models/Budget';
import pushSubscriptions from '@ioc:ApplePushNotifications';
import { BaseCommand } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class ApnPush extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'push:send'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''
    static options: CommandOptions = {
          loadApp: true,
          staysAlive: false,
        };
  // eslint-disable-next-line class-methods-use-this
  public async run() {
    const budgets = await Budget.all();

    await Promise.all(budgets.map(async (budget) => {
      await pushSubscriptions.sendPushNotifications(budget);
    }));
  }
}
