/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class BalanceHistorySchema extends Schema {
    up() {
        this.create('balance_histories', (table) => {
            table.increments();
            table.timestamps();
            table.integer('account_id');
            table.date('date');
            table.decimal('balance', 12, 2);
        });
    }

    down() {
        this.drop('balance_histories');
    }
}

module.exports = BalanceHistorySchema
