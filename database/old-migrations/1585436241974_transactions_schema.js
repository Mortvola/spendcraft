'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TransactionsSchema extends Schema {
  up () {
    this.create('transactions', (table) => {
      table.increments()
      table.timestamps()
      table.string('transaction_id')
      table.integer('account_id')
      table.string('name')
      table.date('date')
      table.decimal('amount', 12, 2)
      table.integer('sort_order')
    })
  }

  down () {
    this.drop('transactions')
  }
}

module.exports = TransactionsSchema
