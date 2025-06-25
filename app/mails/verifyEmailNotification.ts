import { BaseMail } from '@adonisjs/mail'
import env from "#start/env"
import User from '#models/User';

export default class VerifyEmailNotification extends BaseMail {
  from = ''
  subject = ''

  constructor(public user: User) {
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
      .subject('Welcome!')
      .htmlView('emails/welcome', {
        code: this.user.oneTimePassCode?.code,
        expires: env.get('TOKEN_EXPIRATION'),
      });    
  }
}