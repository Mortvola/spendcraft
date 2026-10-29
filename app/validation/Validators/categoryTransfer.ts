import { fundingPercentagesRule } from '#app/validation/fundingPercentages'
import vine, { SimpleMessagesProvider } from '@vinejs/vine';
import { monetaryAmount } from '../monetaryAmount.js'

export const updateCategoryTransfer = vine.compile(
  vine.object({
    date: vine.string(),
    categories: vine.array(
      vine.object({
        id: vine.number().optional(),
        categoryId: vine.number(),
        amount: monetaryAmount(),
        baseAmount: monetaryAmount().optional(),
        comment: vine.string().optional(),
        funder: vine.boolean().optional(),
        fundingCategories: vine.array(
          vine.object({
            categoryId: vine.number(),
            amount: vine.union([
              vine.union.if((_value, field) => vine.helpers.asBoolean(field.parent
                .percentage) === true, vine.number({ strict: true })),
              vine.union.else(monetaryAmount()),
            ]),
            percentage: vine.boolean(),
          }),
        ).use(fundingPercentagesRule()).optional(),
        includeFundingTransfers: vine.boolean().optional(),
      }),
    ).minLength(1), // 'required|validCategory|!allZero:amount|zeroSum:amount',
    type: vine.number(),
  })
)

updateCategoryTransfer.messagesProvider = new SimpleMessagesProvider({
  'date.required': 'A date is required',
  'categories.minLength': 'There must be at least one category',
  'categories.zeroSum': 'The sum of the categories must equal the transaction amount',
})
