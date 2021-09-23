import Plaid from 'plaid';

export default class PlaidError extends Plaid.PlaidError {
  // eslint-disable-next-line camelcase
  status_code: number;
}

