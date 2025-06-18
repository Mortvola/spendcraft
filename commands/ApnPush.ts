import Budget from '#app/Models/Budget';
import { BaseCommand } from "@adonisjs/core/ace";
import app from '@adonisjs/core/services/app';
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
          startApp: true,
          staysAlive: false,
        };
  // eslint-disable-next-line class-methods-use-this
  public async run() {
    const budgets = await Budget.all();

    await Promise.all(budgets.map(async (budget) => {
      const pushSubscriptions = await app.container.make('apn');
      await pushSubscriptions.sendPushNotifications(budget);
    }));
  }
}
