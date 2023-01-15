import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class HomeController {
  // eslint-disable-next-line class-methods-use-this
  public async index({
    auth, view, request, response,
  }: HttpContextContract) : Promise<string | void> {
    return view.render('home');
  }
}
