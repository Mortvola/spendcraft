import vine from '@vinejs/vine'
import { roundAutoAssignmentAmount } from '#services/autoAssignmentAmount'

export const autoAssignmentAmountRule = vine.createRule((value, _options: undefined, field) => {
  try { roundAutoAssignmentAmount(value) }
  catch { field.report('Invalid auto-assignment amount', 'autoAssignmentAmount', field) }
})
