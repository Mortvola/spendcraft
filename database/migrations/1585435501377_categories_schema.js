'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CategoriesSchema extends Schema {
  up () {
    this.create('categories', (table) => {
      table.increments()
      table.timestamps()
      table.integer('group_id')
      table.string('name')
      table.decimal('amount', 12, 2)
    })
  }

  down () {
    this.drop('categories')
  }
}

module.exports = CategoriesSchema
