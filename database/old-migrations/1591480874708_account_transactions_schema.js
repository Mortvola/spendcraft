'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AccountTransactionsSchema extends Schema {
    up() {
        this.table('account_transactions', (table) => {
            table.timestamp('created_at').defaultTo(this.fn.now()).notNullable().alter();
            table.timestamp('updated_at').defaultTo(this.fn.now()).notNullable().alter();
        });
    }

    down() {
        this.table('account_transactions', (table) => {
        // reverse alternations
        });
    }
}

module.exports = AccountTransactionsSchema
