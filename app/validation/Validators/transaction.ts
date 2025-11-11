import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

export const addTransaction = vine.compile(
  vine.object({
    date: vine.date().transform((value) => DateTime.fromJSDate(value)),
    name: vine.string(),
    amount: vine.number(),
    principle: vine.number().optional(),
    comment: vine.string().optional(),
    categories: vine.array(
      vine.object({
        categoryId: vine.number(),
        amount: vine.number(),
        comment: vine.string().optional(),
      }),
    ),
  })
)

export const updateTransaction = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).optional(),
    amount: vine.number().optional(),
    principle: vine.number().optional(),
    date: vine.date().optional().transform((date) => DateTime.fromJSDate(date)),
    comment: vine.string().trim().optional(),
    version: vine.number(),
    statementId: vine.number().nullable().optional(),
    categories: vine.array(
      vine.object({
        categoryId: vine.number(),
        amount: vine.number(),
        comment: vine.string().trim().optional(),
      })
    ).optional(),
  })
)