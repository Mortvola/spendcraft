// import BullMQ from '@ioc:Adonis/Addons/BullMQ'
// import { PlaidWebHookProps, QueueNamesEnum } from '#contracts/QueueInterfaces'
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
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
          loadApp: true,
          staysAlive: false,
        };

  public async run() {
    // const queue = BullMQ.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
    // await queue.add('sync', { itemId: this.itemId })
  }
}
