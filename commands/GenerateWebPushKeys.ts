import webpush from 'web-push';
import { BaseCommand } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class GenerateWebPushKeys extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'generate:web-push-keys'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''
    static options: CommandOptions = {
          startApp: false,
          staysAlive: false,
        };

  public async run() {
    this.logger.info('Hello world!')

    const keys = webpush.generateVAPIDKeys();

    console.log(keys);
  }
}
