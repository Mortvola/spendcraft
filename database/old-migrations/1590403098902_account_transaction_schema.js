/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class InstituionTransactionSchema extends Schema {
    up() {
        this.create('account_transactions', (table) => {
            table.increments();
            table.timestamps();
            table.integer('account_id');
            table.integer('transaction_id');
            table.string('plaid_transaction_id');
            table.string('name');
            table.decimal('amount', 12, 2);
        });
    }

    down() {
        this.drop('account_transactions');
    }
}

module.exports = InstituionTransactionSchema
