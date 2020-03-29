'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class InstitutionsSchema extends Schema {
  async up () {
    let exists = await this.hasTable('institutions');

    if (!exists) {
      this.create('institutions', (table) => {
	      table.increments()
	      table.timestamps()
	      table.string('institution_id')
	      table.string('name')
	      table.string('access_token')
      });
    }
  }

  down () {
    this.dropIfExists('institutions')
  }
}

module.exports = InstitutionsSchema
