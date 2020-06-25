const { ServiceProvider } = require('@adonisjs/fold');
const plaid = require('plaid');

const createPlaidClient = (config) => (
    new plaid.Client(
        config.get('plaid.clientId'),
        config.get('plaid.secret'),
        config.get('plaid.publicKey'),
        plaid.environments[config.get('plaid.environment')],
        { version: '2019-05-29', clientApp: escape(config.get('name')) },
    )
);

class PlaidProvider extends ServiceProvider {
    register() {
        this.app.singleton('Plaid', () => {
            const Config = this.app.use('Adonis/Src/Config');
            return createPlaidClient(Config);
        });
    }
}

module.exports = PlaidProvider;
