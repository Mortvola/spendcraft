import { BaseCommand } from '@adonisjs/core/build/standalone'
import webpush from 'web-push';

export default class GenerateWebPushKeys extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'generate:web-push-keys'

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
    loadApp: false,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process. Don't forget to call 
     * `node ace generate:manifest` afterwards.
     */
    stayAlive: false,
  }

  public async run() {
    this.logger.info('Hello world!')

    const keys = webpush.generateVAPIDKeys();

    console.log(keys);
  }
}
