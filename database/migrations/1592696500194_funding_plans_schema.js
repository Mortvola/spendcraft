/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class FundingPlansSchema extends Schema {
    up () {
        this.table('funding_plans', (table) => {
            // alter table
            table.timestamp('created_at').defaultTo(this.fn.now()).notNullable().alter();
            table.timestamp('updated_at').defaultTo(this.fn.now()).notNullable().alter();
            table.string('name').notNullable().alter();
            table.integer('user_id').notNullable().alter();
        })
    }

    down () {
        this.table('funding_plans', (table) => {
            // reverse alternations
            table.string('name').nullable().alter();
            table.integer('user_id').nullable().alter();
        })
    }
}

module.exports = FundingPlansSchema
