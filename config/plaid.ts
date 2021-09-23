import Env from '@ioc:Adonis/Core/Env'

module.exports = {
    clientId: Env.get('PLAID_CLIENT_ID', ''),
    sandboxSecret: Env.get('PLAID_SANDBOX_SECRET', ''),
    developmentSecret: Env.get('PLAID_DEVELOPMENT_SECRET', ''),
    productionSecret: Env.get('PLAID_PRODUCTION_SECRET', ''),
    environment: Env.get('PLAID_ENV', ''),
};
