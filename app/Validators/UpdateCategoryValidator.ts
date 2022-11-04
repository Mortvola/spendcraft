import { schema, rules } from '@ioc:Adonis/Core/Validator'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class UpdateCategoryValidator {
  constructor(protected ctx: HttpContextContract) {
    this.ctx = ctx;
  }

  public schema = schema.create({
    name: schema.string({}, [
      rules.required(),
      rules.unique({
        table: 'categories',
        column: 'name',
        where: {
          group_id: this.ctx.request.params().groupId,
        },
        whereNot: {
          id: this.ctx.request.params().catId,
        },
      }),
    ]),
    monthlyExpenses: schema.boolean(),
    hidden: schema.boolean(),
  })

  public messages = {
    'name.unique': 'The category name must be unique within the group',
    'name.required': 'The category name is required',
  }
}
