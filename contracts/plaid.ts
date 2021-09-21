declare module '@ioc:Plaid' {
  import {
    AccountsResponse, Account, Institution,
  } from 'plaid';
  import Plaid from 'App/Plaid/Plaid';

  const PlaidClient: Plaid;
  export default PlaidClient;
  export { AccountsResponse, Account as PlaidAccount, Institution as PlaidInstitution };
}
