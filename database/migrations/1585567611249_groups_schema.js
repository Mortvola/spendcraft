'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class GroupsSchema extends Schema {
  up () {
    this.table('groups', (table) => {
      // alter table
      table.integer('user_id');
    })
  }

  down () {
    this.table('groups', (table) => {
      // reverse alternations
      table.dropColumn('user_id');
    })
  }
}

module.exports = GroupsSchema
