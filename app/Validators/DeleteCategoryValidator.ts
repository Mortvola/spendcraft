import { schema, rules } from '@adonisjs/validator'

export default class DeleteCategoryValidator {
  public schema = schema.create({
    params: schema.object().members({
      catId: schema.number([
        rules.transactionsExist(),
      ]),
    }),
  })

  public messages = {
    'params.catId.required': 'A category ids must be provided',
    'params.catId.transactionsExist': 'Before deleting, the category must not contain any transactions',
  }
}
