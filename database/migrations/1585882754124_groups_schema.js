'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class GroupsSchema extends Schema {
  up () {
    this.table('groups', (table) => {
      // alter table
      table.boolean('system').defaultTo(false).notNullable();
    })
  }

  down () {
    this.table('groups', (table) => {
      // reverse alternations
      table.dropColumn('system');
    })
  }
}

module.exports = GroupsSchema
