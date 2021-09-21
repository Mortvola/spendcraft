import { Exception } from '@adonisjs/core/build/standalone'
import PlaidError from 'App/Plaid/PlaidError';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';

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
  plaidError: PlaidError;

  constructor(plaidError: PlaidError) {
    super('Plaid Error', plaidError.status_code, 'PLAID_ERROR');

    this.plaidError = plaidError;
  }

  // eslint-disable-next-line class-methods-use-this
  public async handle(error: this, ctx: HttpContextContract): Promise<void> {
    ctx.response.status(error.status).send({ code: 'PLAID_ERROR', plaidError: error.plaidError.error_code });
  }
}
