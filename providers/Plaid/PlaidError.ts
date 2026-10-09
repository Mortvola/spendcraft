// The SDK error envelope is distinct from the Plaid error body in response.data.
export default interface PlaidError {
  status_code?: number;
  response: {
    status: number;
    data: {
      error_message: string;
      error_code: string;
      error_type: string;
    };
    request?: unknown;
  };
}
