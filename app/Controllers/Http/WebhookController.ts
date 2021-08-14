import jwt from 'jsonwebtoken';
import njwk from 'node-jwk';
import plaidClient from '@ioc:Plaid';
import util from 'util';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Institution from 'App/Models/Institution';
import User from 'App/Models/User';

const getVerificationKey = util
  .promisify(plaidClient.getWebhookVerificationKey)
  .bind(plaidClient);

const keyCache = {};
const waitingRequests = {};

type TransactionEvent = Record<string, unknown> & {
  // eslint-disable-next-line camelcase
  webhook_code: string,
  // eslint-disable-next-line camelcase
  item_id: string,
  // eslint-disable-next-line camelcase
  removed_transactions: string[],
};

const transactionCodes = ['INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE', 'TRANSACTIONS_REMOVED'];

const isTransactionEvent = (r: unknown): r is TransactionEvent => (
  ((r as TransactionEvent).webhook_type !== undefined
  && (r as TransactionEvent).webhook_code !== undefined
  && transactionCodes.includes((r as TransactionEvent).webhook_code))
);

class WebhookController {
  // eslint-disable-next-line class-methods-use-this
  public async post({ request, response }: HttpContextContract) {
    // console.log(JSON.stringify(request.body()));

    const verified = await WebhookController.verify(request);

    if (verified) {
      response.noContent();

      switch (request.body().webhook_type) {
        case 'TRANSACTIONS': {
          const body = request.body();
          if (isTransactionEvent(body)) {
            WebhookController.processTransactionEvent(body);
          }
          break;
        }

        case 'ITEM':
          WebhookController.processItemEvent(request.body());
          break;

        default:
          console.log(`Unhandled webhook type: ${request.body().webhook_type}`);
      }
    }
    else {
      response.badRequest();
    }
  }

  static async processItemEvent(event) {
    switch (event.webhook_code) {
      case 'WEBHOOK_UPDATE_ACKNOWLEDGED':
        break;
      case 'PENDING_EXPIRATION':
        break;
      case 'USER_PERMISSION_REVOKED':
        break;
      case 'ERROR':
        break;
      default:
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
          const user = await User.findOrFail(institution.userId);

          await Promise.all(accounts.map(async (acct) => (
            acct.sync(
              institution.accessToken,
              user,
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
          const institution = await Institution.findByOrFail('plaid_item_id', event.item_id, { client: trx });

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
