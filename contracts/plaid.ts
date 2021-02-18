declare module '@ioc:Plaid' {
  import {
    Client, AccountsResponse, Account, Institution,
  } from 'plaid';

  const PlaidClient: Client;
  export default PlaidClient;
  export { AccountsResponse, Account as PlaidAccount, Institution as PlaidInstitution };
}
