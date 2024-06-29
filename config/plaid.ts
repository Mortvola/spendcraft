import Env from '@ioc:Adonis/Core/Env'
import { PlaidConfig } from '@ioc:Plaid';

const plaidConfig: PlaidConfig = {
    clientId: Env.get('PLAID_CLIENT_ID', ''),
    sandboxSecret: Env.get('PLAID_SANDBOX_SECRET', ''),
    productionSecret: Env.get('PLAID_PRODUCTION_SECRET', ''),
    environment: Env.get('PLAID_ENV', ''),
};

export default plaidConfig;
