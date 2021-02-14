import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class HomeController {
  // eslint-disable-next-line class-methods-use-this
  public async index({ auth, view }: HttpContextContract) : Promise<string> {
    if (auth.user) {
      const props = {
        username: auth.user.username,
      };

      return view.render('home', { props });
    }

    return view.render('welcome');
  }
}
