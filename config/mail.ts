/**
 * Config source: https://git.io/JvgAf
 *
 * Feel free to let us know via PR, if you find something broken in this contract
 * file.
 */

import env from '#start/env'
import { defineConfig } from '@adonisjs/mail'
import { transports } from "@adonisjs/mail";

const mailConfig = defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Default mailer
  |--------------------------------------------------------------------------
  |
  | The following mailer will be used to send emails, when you don't specify
  | a mailer
  |
  */
  default: 'smtp',

  /*
  |--------------------------------------------------------------------------
  | Mailers
  |--------------------------------------------------------------------------
  |
  | You can define or more mailers to send emails from your application. A
  | single `driver` can be used to define multiple mailers with different
  | config.
  |
  | For example: Postmark driver can be used to have different mailers for
  | sending transactional and promotional emails
  |
  */
  mailers: {
    /*
    |--------------------------------------------------------------------------
    | Smtp
    |--------------------------------------------------------------------------
    |
    | Uses SMTP protocol for sending email
    |
    */
    smtp: transports.smtp({
      host: env.get('SMTP_HOST'),
      port: env.get('SMTP_PORT'),
      auth: {
        user: env.get('SMTP_USERNAME'),
        pass: env.get('SMTP_PASSWORD'),
        type: 'login',
      }
    }),

    /*
    |--------------------------------------------------------------------------
    | SES
    |--------------------------------------------------------------------------
    |
    | Uses Amazon SES for sending emails. You will have to install the aws-sdk
    | when using this driver.
    |
    | ```
    | npm i aws-sdk
    | ```
    |
    */
    // ses: transports.ses({
    //   apiVersion: '2010-12-01',
    //   key: env.get('SES_ACCESS_KEY'),
    //   secret: env.get('SES_ACCESS_SECRET'),
    //   region: env.get('SES_REGION'),
    //   sslEnabled: true,
    //   sendingRate: 10,
    //   maxConnections: 5,
    // }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> { }
}
