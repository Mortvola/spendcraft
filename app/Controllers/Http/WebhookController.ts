 
import safeCompare from 'safe-compare'
import { sha256 } from 'js-sha256';
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { DateTime } from 'luxon';
import * as Plaid from 'plaid';
import { HttpContext, Request } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import Institution from '#app/Models/Institution';
import mail from '@adonisjs/mail/services/main';
import { Exception } from '@adonisjs/core/exceptions';
import logger from '@adonisjs/core/services/logger';
import { PlaidWebHookProps, QueueNamesEnum } from '#contracts/QueueInterfaces';
import WebhookLog from '#app/Models/WebhookLog';
import redis from '@adonisjs/redis/services/main';
import app from '@adonisjs/core/services/app';
import ItemLoginRequiredNotification from '#app/mails/itemLoginRequiredNotification';

class WebhookEvent {
   
  webhook_type: string;

   
  webhook_code: string;

   
  item_id: string;

  error: Plaid.PlaidError;
}

class WebhookItemEvent extends WebhookEvent {
}

class TransactionEvent extends WebhookEvent {
   
  removed_transactions: string[];

   
  new_transactions: number;
}

const itemWebhookCodes = ['ERROR', 'PENDING_EXPIRATION', 'USER_PERMISSION_REVOKED', 'WEBHOOK_UPDATE_ACKNOWLEDGED'];
const transactionWebhookCodes = [
  'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE', 'TRANSACTIONS_REMOVED', 'SYNC_UPDATES_AVAILABLE',
];

const isWebhookEvent = (r: unknown): r is WebhookEvent => (
  (r as TransactionEvent).webhook_type !== undefined
  && (r as TransactionEvent).webhook_code !== undefined
);

const isItemEvent = (r: unknown): r is WebhookItemEvent => (
  isWebhookEvent(r)
  && itemWebhookCodes.includes((r as TransactionEvent).webhook_code)
)

const isTransactionEvent = (r: unknown): r is TransactionEvent => (
  isWebhookEvent(r)
  // && (r as TransactionEvent).webhook_code === 'TRANSACTIONS'
  && transactionWebhookCodes.includes((r as TransactionEvent).webhook_code)
);

class WebhookController {
   
  public async post({ request, response }: HttpContext): Promise<void> {
    const verified = await WebhookController.verify(request);

    if (verified) {
      response.noContent();

      const body = request.body();

      // Log the request
      new WebhookLog()
        .fill({
          request: body,
        })
        .save();

      switch (body.webhook_type) {
        case 'TRANSACTIONS': {
          if (isTransactionEvent(body)) {
            WebhookController.processTransactionEvent(body);
          }
          break;
        }

        case 'ITEM':
          if (isItemEvent(body)) {
            await WebhookController.processItemEvent(body);
          }
          break;

        default:
          logger.warn(`Unhandled webhook type: ${body.webhook_type}`);
      }
    }
    else {
      response.badRequest();
    }
  }

  static async processItemEvent(event: WebhookItemEvent): Promise<void> {
    switch (event.webhook_code) {
      case 'WEBHOOK_UPDATE_ACKNOWLEDGED': {
        const webhookUpdated = event as Plaid.WebhookUpdateAcknowledgedWebhook;
        logger.info(`webhook update acknowledged for ${webhookUpdated.item_id}`);
        if (webhookUpdated.error) {
          logger.error(`\terror: ${webhookUpdated.error.error_message}`);
        }
        break;
      }

      case 'PENDING_EXPIRATION':
        logger.info(JSON.stringify(event));
        break;

      case 'USER_PERMISSION_REVOKED':
        logger.info(JSON.stringify(event));
        break;

      case 'ERROR':
        if (event.error.error_code === 'ITEM_LOGIN_REQUIRED') {
          const institution = await Institution.findByOrFail('plaid_item_id', event.item_id);

          const budget = await institution.related('budget').query().firstOrFail();

          const users = await budget.related('users').query();

          await Promise.all(users.map((user) => (
            mail.send(new ItemLoginRequiredNotification(user, institution))
          )));
        }
        else {
          logger.info(JSON.stringify(event));
        }
        break;

      default:
        logger.warn(`Unknown webhook item event: ${JSON.stringify(event)}`);

        break;
    }
  }

  static async syncUpdate(event: Plaid.SyncUpdatesAvailableWebhook) {
    const trx = await db.transaction();

    try {
      const bullmq = await app.container.make('bullmq')
      const queue = bullmq.queue<PlaidWebHookProps, PlaidWebHookProps>(QueueNamesEnum.PlaidWebHook)
      await queue.add('sync', { itemId: event.item_id })
    }
    catch (error) {
      logger.error({ err: error }, `Posting sync to queue failed, event: ${JSON.stringify(event)}`);
      trx.rollback();
    }
  }

  // static async initialUpdate(event: TransactionEvent) {
  //   const trx = await Database.transaction();

  //   try {
  //     const institution = await Institution.findByOrFail('plaidItemId', event.item_id, { client: trx });

  //     const accounts = await institution.related('accounts').query().where('closed', false);
  //     const budget = await Budget.findOrFail(institution.budgetId);

  //     await Promise.all(accounts.map(async (acct) => {
  //       if (institution.accessToken === null || institution.accessToken === '') {
  //         throw new Exception(`access token not set for ${institution.plaidItemId}`);
  //       }

  //       return (
  //         acct.sync(
  //           institution.accessToken,
  //           budget,
  //         )
  //       );
  //     }));

  //     await trx.commit();

  //     await applePushNotifications.sendPushNotifications(budget)
  //   }
  //   catch (error) {
  //     Logger.error({ err: error }, `default update failed, event: ${JSON.stringify(event)}`);
  //     trx.rollback();
  //   }
  // }

  // static async defaultUpdate(event: TransactionEvent) {
  //   const trx = await Database.transaction();

  //   try {
  //     const institution = await Institution.findByOrFail('plaidItemId', event.item_id, { client: trx });

  //     const accounts = await institution.related('accounts').query().where('closed', false);
  //     const budget = await Budget.findOrFail(institution.budgetId);

  //     await Promise.all(accounts.map(async (acct) => {
  //       if (institution.accessToken === null || institution.accessToken === '') {
  //         throw new Exception(`access token not set for ${institution.plaidItemId}`);
  //       }

  //       return (
  //         acct.sync(
  //           institution.accessToken,
  //           budget,
  //         )
  //       );
  //     }));

  //     await trx.commit();

  //     await applePushNotifications.sendPushNotifications(budget)
  //   }
  //   catch (error) {
  //     Logger.error({ err: error }, `default update failed, event: ${JSON.stringify(event)}`);
  //     await trx.rollback();
  //   }
  // }

  // static async removeTransactions(event: TransactionEvent) {
  //   const trx = await Database.transaction();

  //   try {
  //     const institution = await Institution.findByOrFail('plaidItemId', event.item_id, { client: trx });

  //     await institution.removeTransactions(event.removed_transactions);

  //     await trx.commit();
  //   }
  //   catch (error) {
  //     Logger.error(`transactions removed failed: ${error.message}, event: ${JSON.stringify(event)}`);
  //     await trx.rollback();
  //   }
  // }

   
  static processTransactionEvent(event: TransactionEvent): void {
    switch (event.webhook_code) {
      case 'SYNC_UPDATES_AVAILABLE':
        logger.info(JSON.stringify(event));
        WebhookController.syncUpdate((event as unknown) as Plaid.SyncUpdatesAvailableWebhook);
        break;

      case 'INITIAL_UPDATE':
      case 'HISTORICAL_UPDATE':
      case 'DEFAULT_UPDATE':
      case 'TRANSACTIONS_REMOVED':
        logger.info(JSON.stringify(event));
        break;

      default:
        logger.warn(`Unknown webhook transaction event: ${JSON.stringify(event)}`);
        break;
    }
  }

  static async verify(request: Request): Promise<boolean> {
    const signedJwt = request.header('Plaid-Verification');
    if (!signedJwt) {
      throw new Exception('Plaid-Verification header is missing');
    }

    const { kid: currentKid } = decodeProtectedHeader(signedJwt);

    if (!currentKid) {
      throw new Exception('kid is not defined');
    }

    const redisKey = `plaid_wh_key:${currentKid}`
    let keyString = await redis.get(redisKey);

    if (!keyString) {
      // The key was not found in the cache. Retrieve it from the server.
      const plaidClient = await app.container.make('plaid')
      const { key: publicKey } = await plaidClient.getWebhookVerificationKey(currentKid);

      keyString = JSON.stringify(publicKey)
      redis.set(redisKey, keyString)
      redis.expireat(redisKey, DateTime.now().plus({ hours: 24 }).toUnixInteger())
    }

    if (!keyString) {
      throw new Exception('key is not found in cache or received from the server');
    }

    try {
      const key = JSON.parse(keyString)
      const publicKey = await importJWK(key)
      const result = await jwtVerify(signedJwt, publicKey, { maxTokenAge: '5 min' });

      const body = request.raw();
      if (body === null) {
        throw new Exception('body is null');
      }

      const bodyHash = sha256(body);

      return safeCompare(bodyHash, result.payload.request_body_sha256 as string);
    }
    catch (error) {
      logger.error(`token verification failed: ${error.message}`);
      return false;
    }
  }
}

export default WebhookController;
