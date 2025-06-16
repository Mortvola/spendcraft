import env from '#start/env'
import { PlaidConfig } from '@ioc:Plaid';

const plaidConfig: PlaidConfig = {
    clientId: env.get('PLAID_CLIENT_ID', ''),
    sandboxSecret: env.get('PLAID_SANDBOX_SECRET', ''),
    productionSecret: env.get('PLAID_PRODUCTION_SECRET', ''),
    environment: env.get('PLAID_ENV', ''),
};

export default plaidConfig;
