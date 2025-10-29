import vine, { SimpleMessagesProvider } from '@vinejs/vine'
import { DateTime } from 'luxon'

const messagesProvider = new SimpleMessagesProvider({
  'date.unique': 'Only one balance per date is allowed.',
})

export const addBalance = vine.compile(
  vine.object({
    date: vine.date().unique({
      table: 'balance_histories',
      column: 'date',
      filter: (query, _value, field) => {
        query.where('account_id', field.meta.acctId)
      },
    }).transform((date) => DateTime.fromJSDate(date)),
    amount: vine.number(),
  })
)

addBalance.messagesProvider = messagesProvider;

export const updateBalance = vine.compile(
  vine.object({
    date: vine.date().unique({
      table: 'balance_histories',
      column: 'date',
      filter: (query, _value, field) => {
        query.where('account_id', field.meta.acctId)
        .andWhereNot('id', field.meta.id)
      },
    }).transform((date) => DateTime.fromJSDate(date)),
    amount: vine.number(),
  })
)

updateBalance.messagesProvider = messagesProvider;

export const updateAccount = vine.compile(
  vine.object({
    name: vine.string().trim().optional(),
    closed: vine.boolean().optional(),
    startDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    tracking: vine.string().optional(),
  }),  
)