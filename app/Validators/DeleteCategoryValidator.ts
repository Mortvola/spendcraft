import { schema, rules } from '@ioc:Adonis/Core/Validator'

export default class DeleteCategoryValidator {
  public schema = schema.create({
    id: schema.number([
      rules.required(),
      rules.empty({ table: 'transaction_categories', column: 'category_id' }),
    ]),
  })

  public messages = {}
}
