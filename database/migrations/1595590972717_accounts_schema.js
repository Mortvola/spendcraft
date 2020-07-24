'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AccountsSchema extends Schema {
    up() {
        this.table('accounts', (table) => {
            // alter table
            table.timestamp('sync_date');
        });
    }

    down() {
        this.table('accounts', (table) => {
            // reverse alternations
            table.dropColumn('sync_date');
        });
    }
}

module.exports = AccountsSchema
