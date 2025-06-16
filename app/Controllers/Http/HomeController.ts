import { HttpContext } from '@adonisjs/core/http'

export default class HomeController {
  // eslint-disable-next-line class-methods-use-this
  public async index({
    view,
  }: HttpContext) : Promise<string | void> {
    return view.render('home');
  }
}
