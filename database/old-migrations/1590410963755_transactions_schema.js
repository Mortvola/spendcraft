/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TransactionsSchema extends Schema {
    up() {
        this.table('transactions', (table) => {
            table.dropColumn('transaction_id');
            table.dropColumn('account_id');
            table.dropColumn('name');
            table.dropColumn('amount');
        });
    }

    down() {
        this.table('transactions', (table) => {
        // reverse alternations
        });
    }
}

module.exports = TransactionsSchema
