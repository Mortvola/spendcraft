import vine from '@vinejs/vine'

export const addBalance = vine.compile(
  vine.object({
    date: vine.date().unique({
      table: 'balance_histories',
      column: 'date',
      filter: (query, _value, field) => {
        query.where('account_id', field.meta.acctId)
      },
    }),
    amount: vine.number(),
  })
)

export const updateBalance = vine.compile(
  vine.object({
    date: vine.date().unique({
      table: 'balance_histories',
      column: 'date',
      filter: (query, _value, field) => {
        query.where('account_id', field.meta.acctId)
        .andWhereNot('id', field.meta.id)
      },
    }),
    amount: vine.number(),
  })
)
