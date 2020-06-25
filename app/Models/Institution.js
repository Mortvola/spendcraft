'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const plaidClient = use('Plaid');
const Database = use('Database');
const Env = use('Env');

class Institution extends Model {
    static async updateWebhooks() {
        const hook = Env.get('PLAID_WEBHOOK');

        console.log(`Updating webhooks to '${hook}'`);

        if (hook) {
            const result = await Database.select(
                'inst.access_token AS accessToken',
            )
                .table('institutions AS inst');

            result.forEach((item) => {
                console.log(`updating ${item.accessToken}`);
                plaidClient.updateItemWebhook(item.accessToken, hook, (error, response) => {
                    console.log(`error: ${error}, response: ${JSON.stringify(response)}`);
                });
            });
        }
    }
}

module.exports = Institution;
