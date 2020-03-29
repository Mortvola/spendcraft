'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class FundingPlansSchema extends Schema {
  up () {
    this.create('funding_plans', (table) => {
      table.increments()
      table.timestamps()
      table.string('name')
    })
  }

  down () {
    this.drop('funding_plans')
  }
}

module.exports = FundingPlansSchema
