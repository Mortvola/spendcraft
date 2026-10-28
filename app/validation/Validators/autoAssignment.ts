import { monetaryAmount } from '../monetaryAmount.js'
import vine from '@vinejs/vine'
import { autoAssignmentAmountRule } from '../autoAssignmentAmount.js'

export const addAutoAssignment = vine.compile(
  vine.object({
    name: vine.string().trim(),
    searchStrings: vine.array(vine.string()),
    categories: vine.array(
      vine.object({
        id: vine.number(),
        categoryId: vine.number(),
        amount: vine.union([
          vine.union.if((_value, field) => vine.helpers.asBoolean(field.parent.percentage) === true,
            vine.number({ strict: true }).use(autoAssignmentAmountRule())),
          vine.union.else(monetaryAmount({ max: 9999999999.99 })),
        ]),
        percentage: vine.boolean(),
      }),
    ),
  }),
)

export const updateAutoAssignment = vine.compile(
  vine.object({
    name: vine.string().trim(),
    searchStrings: vine.array(vine.string()),
    categories: vine.array(
      vine.object({
        id: vine.number(),
        categoryId: vine.number(),
        amount: vine.union([
          vine.union.if((_value, field) => vine.helpers.asBoolean(field.parent.percentage) === true,
            vine.number({ strict: true }).use(autoAssignmentAmountRule())),
          vine.union.else(monetaryAmount({ max: 9999999999.99 })),
        ]),
        percentage: vine.boolean(),
      }),
    ),
  }),
)
