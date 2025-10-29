import vine from '@vinejs/vine';
import { DateTime } from 'luxon';

export const addStatement = vine.compile(
  vine.object({
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: vine.number(),
    endingBalance: vine.number(),
  }),
)

export const updateStatement = vine.compile(
  vine.object({
    startDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: vine.number().optional(),
    endingBalance: vine.number().optional(),
    reconcile: vine.string().optional(),
  }),
)
