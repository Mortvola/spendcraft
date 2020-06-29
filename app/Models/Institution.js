'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const plaidClient = use('Plaid');
const Database = use('Database');
const Env = use('Env');
const Helpers = use('Helpers');

class Institution extends Model {
    static async updateWebhooks() {
        const hook = Env.get('PLAID_WEBHOOK');

        if (hook) {
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

    static async updateItemIds() {
        const getItem = Helpers.promisify(plaidClient.getItem).bind(plaidClient);

        const result = await Database.select(
            'id',
            'inst.access_token AS accessToken',
        )
            .table('institutions AS inst')
            .whereNull('plaid_item_id');

        await Promise.all(result.map(async (item) => {
            const { item: { item_id: itemId } } = await getItem(item.accessToken);

            await Database.table('institutions').where('id', item.id).update('plaid_item_id', itemId);
        }));
    }
}

module.exports = Institution;
