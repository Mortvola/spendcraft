import { BaseCommand } from '@adonisjs/core/build/standalone'
import Application from 'App/Models/Application';
import applePushNotifications from '@ioc:ApplePushNotifications';

export default class ApnPush extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'apn:push'

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
    const applications = await Application.all();

    await Promise.all(applications.map(async (application) => {
      await applePushNotifications.sendPushNotifications(application);
    }));
  }
}
