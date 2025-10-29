import vine, { SimpleMessagesProvider } from '@vinejs/vine';

export const updateCategoryTransfer = vine.compile(
  vine.object({
    date: vine.string(),
    categories: vine.array(
      vine.object({
        id: vine.number().optional(),
        categoryId: vine.number(),
        amount: vine.number(),
        baseAmount: vine.number().optional(),
        comment: vine.string().optional(),
        funder: vine.boolean().optional(),
        fundingCategories: vine.array(
          vine.object({
            categoryId: vine.number(),
            amount: vine.number(),
            percentage: vine.boolean(),
          }),
        ).optional(),
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
