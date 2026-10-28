import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import { monetaryAmount } from '../monetaryAmount.js';

export const addLoan = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1),
    rate: vine.number(),
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    amount: monetaryAmount(),
  })
)

export const updateLoan = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1),
    rate: vine.number(),
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: monetaryAmount(),
  })
)