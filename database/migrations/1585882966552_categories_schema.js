'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CategoriesSchema extends Schema {
  up () {
    this.table('categories', (table) => {
      // alter table
      table.boolean('system').defaultTo(false).notNullable ();
    })
  }

  down () {
    this.table('categories', (table) => {
      // reverse alternations
      table.dropColumn('system');
    })
  }
}

module.exports = CategoriesSchema
