import Budget from '#app/Models/Budget';
import pushSubscriptions from '@ioc:ApplePushNotifications';
import { BaseCommand } from "@adonisjs/core/ace";

export default class ApnPush extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'push:send'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

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

  // eslint-disable-next-line class-methods-use-this
  public async run() {
    const budgets = await Budget.all();

    await Promise.all(budgets.map(async (budget) => {
      await pushSubscriptions.sendPushNotifications(budget);
    }));
  }
}
