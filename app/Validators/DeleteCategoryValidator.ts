import { schema, rules } from '@ioc:Adonis/Core/Validator'
import { validator } from '@ioc:Adonis/Core/Validator';

export default class DeleteCategoryValidator {
  public schema = schema.create({
    params: schema.object().members({
      catId: schema.number([
        rules.empty({ table: 'transaction_categories', column: 'category_id' }),
      ]),
    }),
  })

  public reporter = validator.reporters.jsonapi;

  public messages = {
    'params.catId.required': 'A category ids must be provided',
    'params.catId.empty': 'Before deleting, the category must not contain any transactions',
  }
}
