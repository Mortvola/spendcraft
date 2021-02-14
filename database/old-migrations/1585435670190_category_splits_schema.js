'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CategorySplitsSchema extends Schema {
  up () {
    this.create('category_splits', (table) => {
      table.increments()
      table.timestamps()
      table.integer('transaction_id')
      table.integer('category_id')
      table.decimal('amount', 12, 2)
    })
  }

  down () {
    this.drop('category_splits')
  }
}

module.exports = CategorySplitsSchema
