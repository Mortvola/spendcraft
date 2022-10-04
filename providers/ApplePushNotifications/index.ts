import fs from 'fs';
import { fetch } from 'fetch-h2';
import { SignJWT } from 'jose/jwt/sign';
import { importPKCS8, KeyLike } from 'jose/key/import';
import { DateTime } from "luxon";
import Application from 'App/Models/Application';
import Logger from '@ioc:Adonis/Core/Logger';
import ApnsToken from 'App/Models/ApnsToken';

class ApplePushNotifications {
  pushNotificationKey: KeyLike | null = null;
  
  providerJwtTime: DateTime | null;

  providerJwt: string | null = null;

  public async sendPushNotifications(application: Application) {
    try {
      const users = await application.related('users').query();
      // const users = await User.query().where('applicationId', application.id)

      if (users.length > 0) {
        await Promise.all(users.map(async (user) => {
          const userTokens = await user.related('apnsTokens').query();

          await Promise.all(userTokens.map(async (userToken) => {
            try {
              await this.sendPushNotification(userToken);
            }
            catch (error) {
              Logger.error({ err: error }, 'Push notification failed');
            }
          }));
        }));
      }
    }
    catch (error) {
      Logger.error({ err: error }, 'push notification failed');
    }
  }

  private async generateProviderJWT() {
    if (this.pushNotificationKey === null) {
      const privateKey = fs.readFileSync('./PushNotificationKey.p8')
      this.pushNotificationKey = await importPKCS8(privateKey.toString(), 'ES256');
    }

    if (this.pushNotificationKey === null) {
      throw new Error('push notification key is null');
    }

    if (this.providerJwt === null || this.providerJwtTime == null
      || this.providerJwtTime.diff(DateTime.now()).as('minutes') > 30
    ) {
      this.providerJwtTime = DateTime.now();
  
      this.providerJwt = await new SignJWT({
        iss: 'N7MR48SV68', // Team ID
        iat: this.providerJwtTime.toSeconds(),
      })
        .setProtectedHeader({
          alg: 'ES256',
          kid: 'L5KGW6G49S', // push notification key ID
        })
        .sign(this.pushNotificationKey)
      }
  }

  private async sendPushNotification(deviceToken: ApnsToken) {
    await this.generateProviderJWT();

    const jwt = this.providerJwt;

    if (jwt === null) {
      throw new Error('provider jwt is null')
    }

    const notification = {
      aps: {
        alert: {
          title: 'New Transactions',
          body: 'New transations are ready to be assigned.',
        },
        sound: 'default',
      },
    }

    try {
      Logger.info(`pushing notification to ${deviceToken.token}`);

      const response = await fetch(`https://api.push.apple.com/3/device/${deviceToken.token}`, {
        method: 'POST',
        body: JSON.stringify(notification),
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
        Logger.info(`apns success, device token: ${deviceToken.token}, apns id: ${response.headers.get('apns-id')}`);
      }
      else {
        const body = await response.json();

        if (response.status === 400 && body.reason === 'BadDeviceToken') {
          // Remove the bad device token
          await deviceToken.delete();
        }

        Logger.error(`apns failure: ${response.status}: ${response.statusText}, body: ${JSON.stringify(body)}`)
      }
    }
    catch (error) {
      Logger.error({ err: error }, 'send push notification');
    }
  }
}

export default ApplePushNotifications;
