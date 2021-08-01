import { schema, rules } from '@ioc:Adonis/Core/Validator'

export default class UpdateCategoryTransferValidator {
  public schema = schema.create({
    date: schema.string({}, [
      rules.required(),
    ]), // 'required|date'
    categories: schema.array([
      rules.minLength(1),
      rules.zeroSum({ property: 'amount' }),
    ]).members(
      schema.object().members({}),
    ), // 'required|validCategory|!allZero:amount|zeroSum:amount',
  })

  public messages = {
    'date.required': 'A date is required',
    'categories.minLength': 'There must be at least one category',
    'categories.zeroSum': 'The sum of the categories must equal the transaction amount',
  }
}
