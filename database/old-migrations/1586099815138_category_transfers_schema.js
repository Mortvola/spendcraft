'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CategoryTransfersSchema extends Schema {
  up () {
    this.table('category_transfers', (table) => {
      // alter table
      table.dropColumn('from_category_id');
      table.dropColumn('to_category_id');
      table.dropColumn('amount');
    })
  }

  down () {
    this.table('category_transfers', (table) => {
      // reverse alternations
    })
  }
}

module.exports = CategoryTransfersSchema
