import Institution from '#models/Institution';
import User from '#models/User';
import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'

export default class ItemLoginRequiredNotification extends BaseMail {
  from = ''
  subject = ''

  constructor(public user: User, public institution: Institution) {
    super()
  }

  /**
   * The "prepare" method is called automatically when
   * the email is sent or queued.
   */
  prepare() {
    this.message
      .from(env.get('MAIL_FROM_ADDRESS') as string, env.get('MAIL_FROM_NAME') as string)
      .to(this.user.email)
      .subject('Action Required')
      .htmlView('emails/item-login-required', { institution: this.institution.name });    
  }
}