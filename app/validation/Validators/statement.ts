import { monetaryAmount } from '../monetaryAmount.js';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';

export const addStatement = vine.create(
  vine.object({
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: monetaryAmount(),
    endingBalance: monetaryAmount(),
    data: vine.object({
      shortTermCapitalGains: monetaryAmount(),
      longTermCapitalGains: monetaryAmount(),
      dividends: monetaryAmount(),
      taxableInterest: monetaryAmount(),
    }).optional()
  }),
)

export const updateStatement = vine.create(
  vine.object({
    startDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: monetaryAmount().optional(),
    endingBalance: monetaryAmount().optional(),
    reconcile: vine.string().optional(),
    data: vine.object({
      shortTermCapitalGains: monetaryAmount(),
      longTermCapitalGains: monetaryAmount(),
      dividends: monetaryAmount(),
      taxableInterest: monetaryAmount(),
    }).optional()
  }),
)
