import { schema, rules } from '@ioc:Adonis/Core/Validator';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';

export default class AddGroupValidator {
  constructor(protected ctx: HttpContextContract) {
    this.ctx = ctx;
  }

  public refs = schema.refs({ budgetId: this.ctx.auth.user ? this.ctx.auth.user.budgetId : null });

  public schema = schema.create({
    name: schema.string({}, [
      rules.required(),
      rules.unique({
        table: 'groups',
        column: 'name',
        where: { application_id: this.refs.budgetId },
      }),
    ]),
    parentGroupId: schema.number(),
  })

  public messages = {
    'name.required': 'A group name must be provided',
    'name.unique': 'The group name must be unique',
  }
}
