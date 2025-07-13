import * as Plaid from 'plaid';

export default interface PlaidError extends Plaid.PlaidError {
  status_code: number;
  response: {
    data: {
      error_message: string,
    },
  };
}

