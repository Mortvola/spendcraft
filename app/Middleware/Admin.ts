import type { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions';

export default class Admin {
   
  public async handle({ auth: { user } }: HttpContext, next: () => Promise<void>) {
    if (!user || !user.roles.includes('ADMIN')) {
      throw new Exception('Not found', { status: 404 });
    }

    await next()
  }
}
