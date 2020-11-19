const { ServiceProvider } = require('@adonisjs/fold');
const plaid = require('plaid');

const createPlaidClient = (config) => (
  new plaid.Client({
    clientID: config.get('plaid.clientId'),
    secret: config.get('plaid.secret'),
    env: plaid.environments[config.get('plaid.environment')],
  })
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
