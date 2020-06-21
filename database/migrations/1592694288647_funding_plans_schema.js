/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class FundingPlansSchema extends Schema {
    up () {
        this.table('funding_plans', (table) => {
            // alter table
            table.integer('user_id');
        })
    }

    down () {
        this.table('funding_plans', (table) => {
            // reverse alternations
            table.dropColumn('user_id');
        })
    }
}

module.exports = FundingPlansSchema
