/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema');

class TransactionsSchema extends Schema {
    up() {
        this.table('transactions', (table) => {
            table.integer('type').notNullable().defaultTo(0);
        });
    }

    down() {
        this.table('transactions', (table) => {
            // reverse alternations
            table.dropColumn('type');
        });
    }
}

module.exports = TransactionsSchema;
