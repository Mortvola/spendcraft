/* eslint-disable max-classes-per-file */
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

const redisKey = 'key-cache';

type Key = {
  alg: string;
  // eslint-disable-next-line camelcase
  created_at: number;
  crv: string;
  // eslint-disable-next-line camelcase
  expired_at: null | number;
  kid: string;
  kty: string;
  use: string;
  x: string;
  y: string;
};

type KeyCacheEntry = { kid: string, cacheTime: string, key: Key };

class WebhookEvent {
  // eslint-disable-next-line camelcase
  webhook_type: string;

  // eslint-disable-next-line camelcase
  webhook_code: string;

  // eslint-disable-next-line camelcase
  item_id: string;

  error: Plaid.PlaidError;
}

class WebhookItemEvent extends WebhookEvent {
}

class TransactionEvent extends WebhookEvent {
  // eslint-disable-next-line camelcase
  removed_transactions: string[];

  // eslint-disable-next-line camelcase
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
  // eslint-disable-next-line class-methods-use-this
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

  // eslint-disable-next-line camelcase
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

    const decodeTokenHeader = decodeProtectedHeader(signedJwt);
    const currentKid = decodeTokenHeader.kid;

    if (!currentKid) {
      throw new Exception('kid is not defined');
    }

    let keyCache: KeyCacheEntry[] = [];

    const keyCacheString = await redis.get(redisKey);
    if (keyCacheString) {
      keyCache = JSON.parse(keyCacheString) as KeyCacheEntry[];
    }

    // If the kid is in the cache but it has been cached for more than 24 hours
    // then remove it.
    let index = keyCache.findIndex((entry) => entry.kid === currentKid);

    if (index !== -1) {
      const cachedKey = keyCache[index];
      if (cachedKey !== undefined
        && DateTime.fromISO(cachedKey.cacheTime).plus({ hours: 24 }) <= DateTime.now()
      ) {
        keyCache = [
          ...keyCache.slice(0, index),
          ...keyCache.slice(index + 1),
        ];

        index = -1
      }
    }

    // If the kid is not in the cache, retrieve it 
    // and refresh any others that are currently in the cache.
    if (index === -1) {
      const keyIDsToUpdate: string[] = [currentKid];
      keyCache.forEach(({ kid, key }) => {
        if (key.expired_at === null) {
          keyIDsToUpdate.push(kid);
        }
      });

      // Fetch the latest key from the verication server for
      // all kids that need to be updated.
      await Promise.all(keyIDsToUpdate.map(async (kid) => {
        const plaidClient = await app.container.make('plaid')
        const { key } = await plaidClient.getWebhookVerificationKey(kid);

        index = keyCache.findIndex((entry) => entry.kid === kid)

        if (key.expired_at === null) {
          if (index === -1) {
            keyCache.push({ kid, cacheTime: DateTime.now().toISO(), key })
          }
          else {
            keyCache[index] = { kid, cacheTime: DateTime.now().toISO(), key }
          }
        }
        // If the key has expired then remove it from the cache.
        else if (index !== -1) {
          keyCache = [
            ...keyCache.slice(0, index),
            ...keyCache.slice(index + 1),
          ];
        }
      }));
    }

    redis.set(redisKey, JSON.stringify(keyCache))

    const cachedKey = keyCache.find((entry) => entry.kid === currentKid);

    if (!cachedKey) {
      throw new Exception('kid is not found in cache');
    }

    const { key } = cachedKey;

    try {
      const pk = await importJWK(key)
      const result = await jwtVerify(signedJwt, pk, { maxTokenAge: '5 min' });

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
