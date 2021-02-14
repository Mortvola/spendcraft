import { schema, rules } from '@ioc:Adonis/Core/Validator'

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

  public messages = {}
}
