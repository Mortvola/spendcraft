/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TransactionsSchema extends Schema {
    up () {
        this.table('transactions', (table) => {
            // alter table
            table.integer('user_id').notNullable().alter();
        })
    }

    down () {
        this.table('transactions', (table) => {
            // reverse alternations
            table.integer('user_id').nullable().alter()
        })
    }
}

module.exports = TransactionsSchema
