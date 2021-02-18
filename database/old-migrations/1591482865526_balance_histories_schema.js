'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class BalanceHistoriesSchema extends Schema {
  up () {
    this.table('balance_histories', (table) => {
      // alter table
      table.timestamp('created_at').defaultTo(this.fn.now()).notNullable().alter();
      table.timestamp('updated_at').defaultTo(this.fn.now()).notNullable().alter();
    })
  }

  down () {
    this.table('balance_histories', (table) => {
      // reverse alternations
    })
  }
}

module.exports = BalanceHistoriesSchema
