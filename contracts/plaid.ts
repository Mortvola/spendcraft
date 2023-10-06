declare module '@ioc:Plaid' {
  import Plaid from 'providers/Plaid/Plaid';

  const PlaidClient: Plaid;
  export default PlaidClient;
  export {
    PlaidInstitution,
    PlaidConfig, PlaidError, PlaidTransaction,
  } from 'providers/Plaid/Plaid';
}
