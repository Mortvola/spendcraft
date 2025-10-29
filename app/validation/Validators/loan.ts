import vine from '@vinejs/vine';
import { DateTime } from 'luxon';

export const addLoan = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1),
    rate: vine.number(),
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    amount: vine.number(),
  })
)

export const updateLoan = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1),
    rate: vine.number(),
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: vine.number(),
  })
)