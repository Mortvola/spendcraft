'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class FundingPlanCategoriesSchema extends Schema {
  up () {
    this.create('funding_plan_categories', (table) => {
      table.increments()
      table.timestamps()
      table.integer('plan_id')
      table.integer('category_id')
      table.decimal('amount', 12, 2)
    })
  }

  down () {
    this.drop('funding_plan_categories')
  }
}

module.exports = FundingPlanCategoriesSchema
