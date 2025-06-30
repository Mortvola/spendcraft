import { PlaidWebHookProps, QueueNamesEnum } from '#contracts/QueueInterfaces'
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import app from "@adonisjs/core/services/app";
import { CommandOptions } from "@adonisjs/core/types/ace";


export default class QueueTest extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'queue:test'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

  @args.string({ description: 'Item id' })
  public itemId: string

  static options: CommandOptions = {
    startApp: true,
  };

  public async run() {
    const bullmq = await app.container.make('bullmq')

    const queue = bullmq.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
    await queue.add('sync', { itemId: this.itemId })

    this.logger.info('test queued')
  }
}
