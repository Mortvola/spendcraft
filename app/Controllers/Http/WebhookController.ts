/* eslint-disable max-classes-per-file */
import jwt from 'jsonwebtoken';
import njwk from 'node-jwk';
import plaidClient from '@ioc:Plaid';
import util from 'util';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Institution from 'App/Models/Institution';
import { PlaidError } from 'plaid';
import Application from 'App/Models/Application';
import Mail from '@ioc:Adonis/Addons/Mail';
import Env from '@ioc:Adonis/Core/Env';

const getVerificationKey = util
  .promisify(plaidClient.getWebhookVerificationKey)
  .bind(plaidClient);

const keyCache = {};
const waitingRequests = {};

class PlaidWebhookError extends PlaidError {
  // eslint-disable-next-line camelcase
  request_id: string;
}

class WebhookEvent {
  // eslint-disable-next-line camelcase
  webhook_type: string;

  // eslint-disable-next-line camelcase
  webhook_code: string;

  // eslint-disable-next-line camelcase
  item_id: string;

  error: PlaidWebhookError;
}

class WebhookItemEvent extends WebhookEvent {
}

class TransactionEvent extends WebhookEvent {
  // eslint-disable-next-line camelcase
  removed_transactions: string[];

  // eslint-disable-next-line camelcase
  new_transactions: number;
}

class WebhookAcknoweldgedEvent extends WebhookEvent {
  // eslint-disable-next-line camelcase
  new_webhook_url: string;
}

const itemWebhookCodes = ['ERROR', 'PENDING_EXPIRATION', 'USER_PERMISSION_REVOKED', 'WEBHOOK_UPDATE_ACKNOWLEDGED'];
const transactionWebhookCodes = ['INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE', 'TRANSACTIONS_REMOVED'];

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
  && (r as TransactionEvent).new_transactions !== undefined
  && transactionWebhookCodes.includes((r as TransactionEvent).webhook_code)
);

class WebhookController {
  // eslint-disable-next-line class-methods-use-this
  public async post({ request, response }: HttpContextContract) {
    // console.log(JSON.stringify(request.body()));

    const verified = await WebhookController.verify(request);

    if (verified) {
      response.noContent();

      const body = request.body();

      switch (request.body().webhook_type) {
        case 'TRANSACTIONS': {
          if (isTransactionEvent(body)) {
            WebhookController.processTransactionEvent(body);
          }
          break;
        }

        case 'ITEM':
          if (isItemEvent(body)) {
            WebhookController.processItemEvent(body);
          }
          break;

        default:
          console.log(`Unhandled webhook type: ${body.webhook_type}`);
      }
    }
    else {
      response.badRequest();
    }
  }

  static async processItemEvent(event: WebhookItemEvent) {
    switch (event.webhook_code) {
      case 'WEBHOOK_UPDATE_ACKNOWLEDGED': {
        const webhookUpdated = event as WebhookAcknoweldgedEvent;
        console.log(`webhook update acknowledged for ${webhookUpdated.item_id}`);
        if (webhookUpdated.error) {
          console.log(`\terror: ${webhookUpdated.error.error_message}`);
        }
        break;
      }

      case 'PENDING_EXPIRATION':
        console.log(JSON.stringify(event));
        break;

      case 'USER_PERMISSION_REVOKED':
        console.log(JSON.stringify(event));
        break;

      case 'ERROR':
        if (event.error.error_code === 'ITEM_LOGIN_REQUIRED') {
          const institution = await Institution.findByOrFail('plaid_item_id', event.item_id);

          const application = await institution.related('application').query().firstOrFail();

          const users = await application.related('users').query();

          await Promise.all(users.map((user) => (
            Mail.send((message) => {
              message
                .from(Env.get('MAIL_FROM_ADDRESS') as string, Env.get('MAIL_FROM_NAME') as string)
                .to(user.email)
                .subject('Action Required')
                .htmlView('emails/item-login-required', { institution: institution.name });
            })
          )));
        }
        else {
          console.log(JSON.stringify(event));
        }
        break;

      default:
        console.log(`unknown webhook code: ${JSON.stringify(event)}`);

        break;
    }
  }

  // eslint-disable-next-line camelcase
  static async processTransactionEvent(event: TransactionEvent) {
    switch (event.webhook_code) {
      case 'INITIAL_UPDATE':
        break;
      case 'HISTORICAL_UPDATE':
        break;
      case 'DEFAULT_UPDATE': {
        const trx = await Database.transaction();

        try {
          const institution = await Institution.findByOrFail('plaidItemId', event.item_id, { client: trx });

          const accounts = await institution.related('accounts').query();
          const application = await Application.findOrFail(institution.applicationId);

          await Promise.all(accounts.map(async (acct) => (
            acct.sync(
              institution.accessToken,
              application,
            )
          )));

          await trx.commit();
        }
        catch (error) {
          console.log(error);
          await trx.rollback();
          throw error;
        }

        break;
      }
      case 'TRANSACTIONS_REMOVED': {
        const trx = await Database.transaction();

        try {
          const institution = await Institution.findByOrFail('plaidItemId', event.item_id, { client: trx });

          await institution.removeTransactions(event.removed_transactions);

          await trx.commit();
        }
        catch (error) {
          console.log(error);
          await trx.rollback();
          throw error;
        }

        break;
      }

      default:
        break;
    }
  }

  static verify(request) {
    return new Promise((resolve) => {
      jwt.verify(request.header('Plaid-Verification'), ({ kid }, callback) => {
        if (kid === undefined) {
          throw new Error('kid is undefined');
        }

        const currentKey = keyCache[kid];

        if (currentKey === undefined) {
          const waiting = waitingRequests[kid];
          if (waiting !== undefined) {
            waiting.push(callback);
          }
          else {
            waitingRequests[kid] = [callback];

            getVerificationKey(kid)
              .then(({ key }) => {
                if (key) {
                  keyCache[kid] = key;
                  waitingRequests[kid].forEach((cb) => {
                    cb(
                      null,
                      njwk.JWK.fromObject(key).key.toPublicKeyPEM(),
                    );
                  });
                }
                else {
                  // todo: What do if res.key is null?
                  // eslint-disable-next-line no-console
                  console.log('key is null');
                }

                delete waitingRequests[kid];
              })
              .catch((error) => {
                // eslint-disable-next-line no-console
                console.log(`getVerificationKey error: ${error}`);
              });
          }
        }
        else {
          callback(
            null,
            njwk.JWK.fromObject(currentKey).key.toPublicKeyPEM(),
          );
        }
      },
      { algorithms: ['ES256'] },
      (error, decoded) => {
        if (error) {
          // eslint-disable-next-line no-console
          console.log(`error: ${error}, decoded: ${JSON.stringify(decoded, null, 4)}`);
          resolve(false);
        }
        else {
          resolve(true);
        }
      });
    });
  }
}

module.exports = WebhookController;
