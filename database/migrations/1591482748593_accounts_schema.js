'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AccountsSchema extends Schema {
  up () {
    this.table('accounts', (table) => {
      // alter table
      table.timestamp('created_at').defaultTo(this.fn.now()).notNullable().alter();
      table.timestamp('updated_at').defaultTo(this.fn.now()).notNullable().alter();
    })
  }

  down () {
    this.table('accounts', (table) => {
      // reverse alternations
    })
  }
}

module.exports = AccountsSchema
