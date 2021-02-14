import { schema, rules } from '@ioc:Adonis/Core/Validator'

export default class DeleteGroupValidator {
  public schema = schema.create({
    id: schema.number([
      rules.required(),
      rules.empty({ table: 'groups', column: 'id' }),
    ]),
  })

  public messages = {}
}
