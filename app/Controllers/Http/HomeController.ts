import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class HomeController {
  // eslint-disable-next-line class-methods-use-this
  public async index({
    auth, view, request, response,
  }: HttpContextContract) : Promise<string | void> {
    if (auth.user) {
      if (request.matchesRoute('/')) {
        return response.redirect('/home');
      }

      const props = {
        username: auth.user.username,
      };

      return view.render('home', { props });
    }

    return view.render('welcome');
  }
}
