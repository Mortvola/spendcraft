import { HttpContext } from '@adonisjs/core/http'

export default class HomeController {
   
  public async index({
    view,
  }: HttpContext) : Promise<string | undefined> {
    return view.render('home');
  }
}
