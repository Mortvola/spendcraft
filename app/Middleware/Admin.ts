import type { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@poppinss/utils';

export default class Admin {
  // eslint-disable-next-line class-methods-use-this
  public async handle({ auth: { user } }: HttpContext, next: () => Promise<void>) {
    if (!user || !user.roles.includes('ADMIN')) {
      throw new Exception('Not found', 404, 'E_ROUTE_NOT_FOUND');
    }

    await next()
  }
}
