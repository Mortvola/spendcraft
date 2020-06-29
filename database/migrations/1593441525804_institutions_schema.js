'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class InstitutionsSchema extends Schema {
  up () {
    this.table('institutions', (table) => {
      // alter table
      table.string('plaid_item_id').notNullable().alter();
    })
  }

  down () {
    this.table('institutions', (table) => {
      // reverse alternations
      table.string('plaid_item_id').nullable().alter();
    })
  }
}

module.exports = InstitutionsSchema
