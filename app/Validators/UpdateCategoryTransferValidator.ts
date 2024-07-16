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
      schema.object().members({
        id: schema.number.optional(),
        categoryId: schema.number(),
        amount: schema.number(),
        comment: schema.string.optional(),
      }),
    ), // 'required|validCategory|!allZero:amount|zeroSum:amount',
    type: schema.number(),
  })

  public messages = {
    'date.required': 'A date is required',
    'categories.minLength': 'There must be at least one category',
    'categories.zeroSum': 'The sum of the categories must equal the transaction amount',
  }
}
