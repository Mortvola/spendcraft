import { HttpContext } from '@adonisjs/core/http';
import PlaidError from './PlaidError.js';
import { Exception } from "@adonisjs/core/exceptions";
import redactDiagnostics from './redactDiagnostics.js';

/*
|--------------------------------------------------------------------------
| Exception
|--------------------------------------------------------------------------
|
| The Exception class imported from `@adonisjs/core` allows defining
| a status code and error code for every exception.
|
| @example
| new PlaidExeptionException('message', 500, 'E_RUNTIME_EXCEPTION')
|
*/
export default class PlaidException extends Exception {
  plaidError: unknown;

  constructor(plaidError: PlaidError) {
    super(plaidError.response.data.error_message, { code: 'PLAID_ERROR', status: plaidError.status_code, cause: plaidError });

    this.plaidError = redactDiagnostics(plaidError.response.data);
  }

  static from(error: unknown): Error {
    if (isPlaidError(error)) return new PlaidException(error);

    // SDK errors can carry credentials in config/request. Keep those on the cause,
    // rather than enumerable fields copied into existing error logs.
    const preserved = new Error(error instanceof Error ? error.message : 'Unexpected Plaid provider failure', { cause: error });
    if (error instanceof Error) preserved.name = error.name;
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
      return Object.assign(preserved, { code: error.code });
    }
    return preserved;
  }

  public async handle(error: this, ctx: HttpContext): Promise<void> {
    ctx.response.status(error.status).send({
      message: error.message,
      code: 'PLAID_ERROR',
      plaidError: error.plaidError,
    });
  }
}

function isPlaidError(error: unknown): error is PlaidError {
  if (typeof error !== 'object' || error === null || !('response' in error)) return false;
  const response = error.response;
  return typeof response === 'object' && response !== null
    && 'status' in response && typeof response.status === 'number'
    && 'data' in response && typeof response.data === 'object' && response.data !== null
    && 'error_message' in response.data && typeof response.data.error_message === 'string'
    && 'error_code' in response.data && typeof response.data.error_code === 'string'
    && 'error_type' in response.data && typeof response.data.error_type === 'string'
    && (!('status_code' in error) || typeof error.status_code === 'number');
}
