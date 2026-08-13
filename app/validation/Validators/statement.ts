import vine from '@vinejs/vine';
import { DateTime } from 'luxon';

export const addStatement = vine.create(
  vine.object({
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: vine.number(),
    endingBalance: vine.number(),
    data: vine.object({
      shortTermCapitalGains: vine.number(),
      longTermCapitalGains: vine.number(),
      dividends: vine.number(),
      taxableInterest: vine.number(),
    }).optional()
  }),
)

export const updateStatement = vine.create(
  vine.object({
    startDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: vine.number().optional(),
    endingBalance: vine.number().optional(),
    reconcile: vine.string().optional(),
    data: vine.object({
      shortTermCapitalGains: vine.number(),
      longTermCapitalGains: vine.number(),
      dividends: vine.number(),
      taxableInterest: vine.number(),
    }).optional()
  }),
)
