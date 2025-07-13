import { HttpContext } from '@adonisjs/core/http';
import PlaidError from './PlaidError.js';
import { Exception } from "@adonisjs/core/exceptions";

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
    super(plaidError.response.data.error_message, { code: 'PLAID_ERROR', status: plaidError.status_code});

    this.plaidError = plaidError.response.data;
  }

  public async handle(error: this, ctx: HttpContext): Promise<void> {
    ctx.response.status(error.status).send({
      message: error.message,
      code: 'PLAID_ERROR',
      plaidError: error.plaidError,
    });
  }
}
