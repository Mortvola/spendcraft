const jwt = require('jsonwebtoken');
const njwk = require('node-jwk');

const plaidClient = use('Plaid');
const Helpers = use('Helpers');
const Database = use('Database');
const Institution = use('App/Models/Institution')

const getVerificationKey = Helpers
    .promisify(plaidClient.getWebhookVerificationKey)
    .bind(plaidClient);

const keyCache = {};
const waitingRequests = {};

class WebhookController {
    static async post({ request, response }) {
        console.log(JSON.stringify(request.body));

        const verified = await WebhookController.verify(request);

        if (verified) {
            response.noContent();

            switch (request.body.webhook_type) {
            case 'TRANSACTIONS':
                WebhookController.processTransactionEvent(request.body);
                break;

            case 'ITEM':
                WebhookController.processItemEvent(request.body);
                break;

            default:
                console.log(`Unhandled webhook type: ${request.body.webhook_type}`);
            }
        }
        else {
            response.badRequest();
        }
    }

    static async processsItemEvent(event) {
        switch (event.webook_code) {
        case 'WEBHOOK_UPDATE_ACKNOWLEDGED':
            break;
        case 'PENDING_EXPIRATION':
            break;
        case 'ERROR':
            break;
        default:
            break;
        }
    }

    static async processTransactionEvent(event) {
        switch (event.webook_code) {
        case 'INITIAL_UPDATE':
            break;
        case 'HISTORICAL_UPDATE':
            break;
        case 'DEFAULT_UPDATE': {
            const institution = await Institution
                .query()
                .where('plaid_item_id', event.item_id)
                .with('accounts')
                .fetch();

            if (institution.size() > 0) {
                const trx = await Database.beginTransaction();

                const accounts = institution.first().getRelated('accounts');

                await Promise.all(accounts.rows.map(async (acct) => (
                    acct.sync(trx, institution.first().access_token, institution.fist().user_id)
                )));

                trx.commit();
            }

            break;
        }
        case 'TRANSACTIONS_REMOVED':
            break;
        default:
            break;
        }
    }

    static verify(request) {
        return new Promise((resolve) => {
            jwt.verify(request.header('Plaid-Verification'), ({ kid }, callback) => {
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
