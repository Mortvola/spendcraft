import { schema, rules } from '@ioc:Adonis/Core/Validator'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { CategoryType } from 'Common/ResponseTypes';

export default class UpdateCategoryValidator {
  constructor(protected ctx: HttpContextContract) {
    this.ctx = ctx;
  }

  public schema = schema.create({
    name: schema.string({}, [
      rules.required(),
      rules.unique({
        table: 'categories',
        column: 'name',
        where: {
          group_id: this.ctx.request.params().groupId,
        },
        whereNot: {
          id: this.ctx.request.params().catId,
        },
      }),
    ]),
    monthlyExpenses: schema.boolean.optional(),
    type: schema.enum([CategoryType.Regular, CategoryType.Bill, CategoryType.Goal] as const),
    goalDate: schema.date.optional(),
    recurrence: schema.number.optional(),
    suspended: schema.boolean.optional(),
    fundingAmount: schema.number.optional(),
    includeFundingTransfers: schema.boolean.optional(),
    hidden: schema.boolean(),
    useGoal: schema.boolean(),
    fundingCategories: schema.array().members(
      schema.object().members({
        categoryId: schema.number(),
        amount: schema.number(),
        percentage: schema.boolean(),
      }),
    ),
  })

  public messages = {
    'name.unique': 'The category name must be unique within the group',
    'name.required': 'The category name is required',
  }
}
