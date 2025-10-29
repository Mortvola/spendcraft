import vine from '@vinejs/vine';
import { DateTime } from 'luxon';

export const category = vine.compile(
  vine.object({
    amount: vine.number(),
    useGoal: vine.boolean().optional(),
    goalDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    recurrence: vine.number(),
  }),  
)