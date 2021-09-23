declare module '@ioc:Plaid' {
  import Plaid, {
    PlaidConfig, AccountsResponse, PlaidAccount, PlaidInstitution,
    PlaidError, PlaidTransaction,
  } from 'providers/Plaid/Plaid';

  const PlaidClient: Plaid;
  export default PlaidClient;
  export {
    AccountsResponse, PlaidAccount, PlaidInstitution,
    PlaidConfig, PlaidError, PlaidTransaction,
  };
}
