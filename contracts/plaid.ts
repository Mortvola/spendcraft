declare module '@ioc:Plaid' {
  import Plaid, { PlaidError } from 'providers/Plaid/Plaid';

  const PlaidClient: Plaid;
  export default PlaidClient;
  export {
    AccountsResponse, PlaidAccount, PlaidInstitution,
    PlaidConfig, PlaidError, PlaidTransaction,
  } from 'providers/Plaid/Plaid';
}
