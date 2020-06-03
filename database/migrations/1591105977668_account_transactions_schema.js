/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AccountTransactionsSchema extends Schema {
    up() {
        this.table('account_transactions', (table) => {
            table.boolean('pending').notNullable().default(false);
        });
    }

    down() {
        this.table('account_transactions', (table) => {
            table.dropColumn('pending');
        });
    }
}

module.exports = AccountTransactionsSchema
