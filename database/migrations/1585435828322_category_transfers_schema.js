'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CategoryTransfersSchema extends Schema {
  up () {
    this.create('category_transfers', (table) => {
      table.increments()
      table.timestamps()
      table.integer('from_category_id')
      table.integer('to_category_id')
      table.decimal('amount', 12, 2)
      table.date('date')
    })
  }

  down () {
    this.drop('category_transfers')
  }
}

module.exports = CategoryTransfersSchema
