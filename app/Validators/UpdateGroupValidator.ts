import { schema, rules } from '@adonisjs/validator'
import { HttpContext } from '@adonisjs/core/http'

export default class UpdateGroupValidator {
  constructor(protected ctx: HttpContext) {
    this.ctx = ctx;
  }

  public refs = schema.refs({ budgetId: this.ctx.auth.user ? this.ctx.auth.user.budgetId : null });

  public schema = schema.create({
    name: schema.string({}, [
      rules.required(),
      rules.unique({
        table: 'groups',
        column: 'name',
        where: {
          application_id: this.refs.budgetId,
        },
        whereNot: {
          id: this.ctx.request.params().groupId,
        },
      }),
    ]),
    parentGroupId: schema.number.nullableAndOptional(),
    hidden: schema.boolean(),
  })

  public messages = {
    'name.required': 'A group name must be provided',
    'name.unique': 'The group name must be unique',
  }
}
