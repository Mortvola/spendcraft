'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class InstitutionsSchema extends Schema {
  up () {
    this.table('institutions', (table) => {
      // alter table
      table.integer('user_id');
    })
  }

  down () {
    this.table('institutions', (table) => {
      // reverse alternations
      table.dropColumn('user_id');
    })
  }
}

module.exports = InstitutionsSchema
