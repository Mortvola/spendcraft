import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class HomeController {
  // eslint-disable-next-line class-methods-use-this
  public async index({
    view,
  }: HttpContextContract) : Promise<string | void> {
    return view.render('home');
  }
}
