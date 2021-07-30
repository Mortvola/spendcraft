import { schema, rules } from '@ioc:Adonis/Core/Validator'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class AddCategoryValidator {
  constructor(protected ctx: HttpContextContract) {
    this.ctx = ctx;
  }

  public schema = schema.create({
    name: schema.string({}, [
      rules.required(),
      rules.unique({
        table: 'categories',
        column: 'name',
        where: { group_id: this.ctx.request.params().groupId },
      }),
    ]),
  })

  public messages = {
    'name.required': 'A category name must be provided',
    'name.unique': 'The category name must be unique within a group',
  }
}
