import { args, BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import mail from '@adonisjs/mail/services/main'
import TestNotification from '#mails/testNotification';

export default class CheckEmail extends BaseCommand {
  static commandName = 'check:email'
  static description = 'Sends a test email to the specified address'

  @args.string()
  declare email: string

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    try {
      await mail.send(new TestNotification(this.email));

      this.logger.info('Email send completed')
    }
    catch (error) {
      this.logger.error(error)
    }
  }
}