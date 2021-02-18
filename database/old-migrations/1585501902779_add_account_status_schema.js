'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class UsersSchema extends Schema {
  up () {
    this.alter('users', (table) => {
    	table.string('account_status');
    })
  }

  down () {
    this.alter('users', (table) => {
    	table.dropColumn('account_status');
    })
  }
}

module.exports = UsersSchema
