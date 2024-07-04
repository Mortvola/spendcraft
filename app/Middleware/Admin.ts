import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { Exception } from '@poppinss/utils';

export default class Admin {
  // eslint-disable-next-line class-methods-use-this
  public async handle({ auth: { user } }: HttpContextContract, next: () => Promise<void>) {
    if (!user || !user.admin) {
      throw new Exception('Not found', 404, 'E_ROUTE_NOT_FOUND');
    }

    await next()
  }
}
