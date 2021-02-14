import Env from '@ioc:Adonis/Core/Env'

module.exports = {
    clientId: Env.get('PLAID_CLIENT_ID', ''),
    secret: Env.get('PLAID_SECRET', ''),
    publicKey: Env.get('PLAID_PUBLIC_KEY', ''),
    environment: Env.get('PLAID_ENV', ''),
};
