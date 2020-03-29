'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AccountsSchema extends Schema {
  async up () {
    let exists = await this.hasTable('accounts');

    if (!exists) {
      this.create('accounts', (table) => {
        table.increments()
        table.timestamps()
	table.string('plaid_account_id')
	table.string('name')
	table.string('official_name')
	table.string('mask')
	table.string('subtype')
	table.string('type')
	table.integer('institution_id')
	table.date('start_date')
	table.decimal('balance', 12, 2)
	table.boolean('enabled')
	table.string('tracking')
      })
    }
  }

  down () {
    this.dropIfExists('accounts')
  }
}

module.exports = AccountsSchema
