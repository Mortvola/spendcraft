const jwt = require('jsonwebtoken');
const njwk = require('node-jwk');

const plaidClient = use('Plaid');
const Helpers = use('Helpers');

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
        }
        else {
            response.badRequest();
        }
    }

    static verify(request) {
        return new Promise((resolve) => {
            jwt.verify(request.header('Plaid-Verification'), (header, callback) => {
                const currentKey = keyCache[header.kid];

                if (currentKey === undefined) {
                    const waiting = waitingRequests[header.kid];
                    if (waiting !== undefined) {
                        waiting.push(callback);
                    }
                    else {
                        waitingRequests[header.kid] = [callback];

                        getVerificationKey(header.kid)
                            .then((res) => {
                                if (res.key) {
                                    keyCache[header.kid] = res.key;
                                    waitingRequests[header.kid].forEach((cb) => {
                                        cb(
                                            null,
                                            njwk.JWK.fromObject(res.key).key.toPublicKeyPEM(),
                                        );
                                    });
                                }
                                else {
                                    // todo: What do if res.key is null?
                                    // eslint-disable-next-line no-console
                                    console.log('key is null');
                                }

                                delete waitingRequests[header.kid];
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
