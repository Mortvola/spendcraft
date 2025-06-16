import { InferMailersFromConfig } from '@adonisjs/mail/build/config'
import mailConfig from '../config/mail.js'

declare module '@ioc:Adonis/Addons/Mail' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface MailersList extends InferMailersFromConfig<typeof mailConfig> {}
}
