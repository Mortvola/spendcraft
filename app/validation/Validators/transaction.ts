import vine from '@vinejs/vine'
import { DateTime } from 'luxon'
import { monetaryAmount } from '../monetaryAmount.js'

export const addTransaction = vine.create(
  vine.object({
    date: vine.date().transform((value) => DateTime.fromJSDate(value)),
    name: vine.string(),
    amount: monetaryAmount(),
    principle: monetaryAmount().optional(),
    comment: vine.string().optional(),
    categories: vine.array(
      vine.object({
        categoryId: vine.number(),
        amount: monetaryAmount(),
        comment: vine.string().optional(),
      }),
    ),
  })
)

export const updateTransaction = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).optional(),
    amount: monetaryAmount().optional(),
    principle: monetaryAmount().optional(),
    date: vine.date().optional().transform((date) => DateTime.fromJSDate(date)),
    comment: vine.string().trim().optional(),
    version: vine.number(),
    statementId: vine.number().nullable().optional(),
    categories: vine.array(
      vine.object({
        categoryId: vine.number(),
        amount: monetaryAmount(),
        comment: vine.string().trim().optional(),
      })
    ).optional(),
    taxCategories: vine.array(
      vine.object({
        type: vine.string(),
        amount: monetaryAmount()
      })
    ).optional()
  })
)