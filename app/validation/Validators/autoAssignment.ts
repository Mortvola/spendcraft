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
        amount: vine.number().use(autoAssignmentAmountRule()),
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
        amount: vine.number().use(autoAssignmentAmountRule()),
        percentage: vine.boolean(),
      }),
    ),
  }),
)
