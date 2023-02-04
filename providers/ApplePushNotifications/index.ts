import fs from 'fs';
import { context, FetchInit, Request, Response } from 'fetch-h2';
import { SignJWT, importPKCS8, KeyLike } from 'jose';
import { DateTime } from "luxon";
import Budget from 'App/Models/Budget';
import Logger from '@ioc:Adonis/Core/Logger';
import ApnsToken from 'App/Models/ApnsToken';

type FetchType = (input: string | Request, init?: Partial<FetchInit> | undefined) => Promise<Response>;

class ApplePushNotifications {
  pushNotificationKey: KeyLike | null = null;
  
  providerJwtTime: DateTime | null;

  providerJwt: string | null = null;

  public async sendPushNotifications(budget: Budget) {
    const { fetch, disconnectAll } = context();

    try {
      const unassigned = await budget.getUnassignedCategory();
      const transactions = await unassigned.transactions(budget);

      if (transactions.length > 0) {
        const users = await budget.related('users').query();
        // const users = await User.query().where('applicationId', budget.id)

        if (users.length > 0) {
          await Promise.all(users.map(async (user) => {
            const userTokens = await user.related('apnsTokens').query();

            for (let userToken of userTokens) {
              try {
                await this.sendPushNotification(fetch, userToken, transactions.length);
              }
              catch (error) {
                Logger.error({ err: error }, 'Push notification failed');
              }
            }
          }));
        }
      }
    }
    catch (error) {
      Logger.error({ err: error }, 'push notification failed');
    }

    disconnectAll();
  }

  private async generateProviderJWT() {
    if (this.pushNotificationKey === null) {
      const privateKey = fs.readFileSync('./PushNotificationKey.p8')
      this.pushNotificationKey = await importPKCS8(privateKey.toString(), 'ES256');
    }

    if (this.pushNotificationKey === null) {
      throw new Error('push notification key is null');
    }

    let age: Number | null = null;
    if (this.providerJwtTime) {
      age = DateTime.now().diff(this.providerJwtTime, 'minutes').minutes;
    }

    if (this.providerJwt === null || age == null
      || age > 30
    ) {
      Logger.info(`Generating new provider token. Age: ${age}`);

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

  private async sendPushNotification(
    fetch: FetchType,
    deviceToken: ApnsToken,
    unassigned: number,
  ) {
    await this.generateProviderJWT();

    const jwt = this.providerJwt;

    if (jwt === null) {
      throw new Error('provider jwt is null')
    }

    const notification = {
      aps: {
        alert: {
          title: 'New Transactions',
          body: `You have ${unassigned} transaction${unassigned == 1 ? '' : 's'} ready to be assigned.`,
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
