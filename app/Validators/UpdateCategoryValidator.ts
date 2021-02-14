import { schema, rules } from '@ioc:Adonis/Core/Validator'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class UpdateCategoryValidator {
  constructor(protected ctx: HttpContextContract) {
    this.ctx = ctx;
  }

  public schema = schema.create({
    groupId: schema.number(),
    name: schema.string({}, [
      rules.required(),
      rules.unique({
        table: 'categories',
        column: 'name',
        where: {
          groupId: this.ctx.request.params().groupId,
        },
        whereNot: {
          id: this.ctx.request.params().id,
        },
      }),
    ]),
  })

  public messages = {}
}
