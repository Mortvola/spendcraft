import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

export const updateAccount = vine.create(
  vine.object({
    name: vine.string().trim().optional(),
    closed: vine.boolean().optional(),
    startDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    tracking: vine.string().optional(),
    type: vine.string().optional(),
    subtype: vine.string().optional()
  }),  
)