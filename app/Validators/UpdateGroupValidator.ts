import { schema, rules } from '@ioc:Adonis/Core/Validator'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class UpdateGroupValidator {
  constructor(protected ctx: HttpContextContract) {
    this.ctx = ctx;
  }

  public refs = schema.refs({ userId: this.ctx.auth.user ? this.ctx.auth.user.id : null });

  public schema = schema.create({
    name: schema.string({}, [
      rules.required(),
      rules.unique({
        table: 'groups',
        column: 'name',
        where: {
          user_id: this.refs.userId,
        },
        whereNot: {
          id: this.ctx.request.params().groupId,
        },
      }),
    ]),
  })

  public messages = {
    'name.required': 'A group name must be provided',
    'name.unique': 'The group name must be unique',
  }
}
