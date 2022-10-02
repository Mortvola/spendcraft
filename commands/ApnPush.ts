import { BaseCommand } from '@adonisjs/core/build/standalone'
import { SignJWT } from 'jose/jwt/sign'
import { importPKCS8 } from 'jose/key/import'
import fs from 'fs'
import { fetch } from 'fetch-h2'

export default class ApnPush extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'apn:push'

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

  // eslint-disable-next-line class-methods-use-this
  public async run() {
    const privateKey = fs.readFileSync('./AuthKey_L5KGW6G49S.p8')

    const key = await importPKCS8(privateKey.toString(), 'ES256');

    const jwt = await new SignJWT({
      iss: 'N7MR48SV68',
      iat: 1664732480,
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'L5KGW6G49S' })
      .setIssuedAt()
      .setIssuer('N7MR48SV68')
      .sign(key)

    console.log(jwt)

    const notifictation = {
      aps: {
        alert: {
          title: 'New Transactions',
          body: 'New transations are ready to be assigned.',
        },
        sound: 'default',
        badge: 3,
      },
    }

    try {
      const response = await fetch('https://api.sandbox.push.apple.com/3/device/c0bb711c5fbb8c9e51516b50053a28a143fec0a9d36bb60526e1c0f2320cbfc9', {
        method: 'POST',
        body: JSON.stringify(notifictation),
        headers: {
          'Content-Type': 'application/json',
          authorization: `bearer ${jwt}`,
          'apns-priority': '5',
          'apns-topic': 'app.spendcraft',
          'apns-push-type': 'alert',
          'apns-collapse-id': 'new-transactions',
        },
      })

      if (response.ok) {
        console.log('success!');
      }
      else {
        console.log(`${response.status}: ${response.statusText}`)
        console.log('failure');
        const body = await response.json();
        console.log(JSON.stringify(body))
      }
    }
    catch (error) {
      console.log(error);
    }
  }
}
