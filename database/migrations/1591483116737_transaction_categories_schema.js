'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TransactionCategoriesSchema extends Schema {
  up () {
    this.table('transaction_categories', (table) => {
      // alter table
      table.timestamp('created_at').defaultTo(this.fn.now()).notNullable().alter();
      table.timestamp('updated_at').defaultTo(this.fn.now()).notNullable().alter();
    })
  }

  down () {
    this.table('transaction_categories', (table) => {
      // reverse alternations
    })
  }
}

module.exports = TransactionCategoriesSchema
