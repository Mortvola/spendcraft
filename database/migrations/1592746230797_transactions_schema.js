/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TransactionsSchema extends Schema {
    up () {
        this.table('transactions', (table) => {
            // alter table
            table.integer('user_id');
        })
    }

    down () {
        this.table('transactions', (table) => {
            // reverse alternations
            table.dropColumn('user_id');
        })
    }
}

module.exports = TransactionsSchema
