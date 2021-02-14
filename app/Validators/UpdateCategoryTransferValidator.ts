import { schema, rules } from '@ioc:Adonis/Core/Validator'

export default class UpdateCategoryTransferValidator {
  public schema = schema.create({
    date: schema.string(), // 'required|date'
    categories: schema.array([
      rules.minLength(1),
      rules.zeroSum({ property: 'amount' }),
    ]).members(
      schema.object().members({}),
    ), // 'required|validCategory|!allZero:amount|zeroSum:amount',
  })

  public messages = {}
}
