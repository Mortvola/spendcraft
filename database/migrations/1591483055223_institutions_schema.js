'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class InstitutionsSchema extends Schema {
  up () {
    this.table('institutions', (table) => {
      // alter table
      table.timestamp('created_at').defaultTo(this.fn.now()).notNullable().alter();
      table.timestamp('updated_at').defaultTo(this.fn.now()).notNullable().alter();
    })
  }

  down () {
    this.table('institutions', (table) => {
      // reverse alternations
    })
  }
}

module.exports = InstitutionsSchema
