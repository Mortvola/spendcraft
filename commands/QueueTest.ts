import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import BullMQ from '@ioc:Adonis/Addons/BullMQ'
import { PlaidWebHookProps, QueueNamesEnum } from 'Contracts/QueueInterfaces'

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
    const queue = BullMQ.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
    await queue.add('sync', { itemId: this.itemId })
  }
}
