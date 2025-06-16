import { schema, rules } from '@adonisjs/validator';

export default class AddCategoryTransferValidator {
  public schema = schema.create({
    date: schema.string({}, [
      rules.required(),
    ]), // 'required'
    categories: schema.array([
      rules.minLength(1),
      rules.zeroSum({ property: 'amount' }),
    ]).members(
      schema.object().members({}),
    ), // 'required|zeroSum:amount',
  })

  public messages = {
    'date.required': 'A date is required',
    'categories.minLength': 'There must be at least one category',
    'categories.zeroSum': 'The sum of the categories must equal the transaction amount',
  }
}
