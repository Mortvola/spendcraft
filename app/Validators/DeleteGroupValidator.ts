import { schema, rules } from '@ioc:Adonis/Core/Validator'

export default class DeleteGroupValidator {
  public schema = schema.create({
    params: schema.object().members({
      groupId: schema.number([
        rules.empty({ table: 'categories', column: 'group_id' }),
      ]),
    }),
  })

  public messages = {
    'params.groupId.empty': 'Before deleting, the group must not contain any categories',
  }
}
