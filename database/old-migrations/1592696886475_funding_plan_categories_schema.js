/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class FundingPlanCategoriesSchema extends Schema {
    up () {
        this.table('funding_plan_categories', (table) => {
            // alter table
            table.timestamp('created_at').defaultTo(this.fn.now()).notNullable().alter();
            table.timestamp('updated_at').defaultTo(this.fn.now()).notNullable().alter();
            table.integer('plan_id').notNullable().alter();
            table.integer('category_id').notNullable().alter();
            table.decimal('amount', 12, 2).notNullable().alter();
        })
    }

    down () {
        this.table('funding_plan_categories', (table) => {
        // reverse alternations
        })
    }
}

module.exports = FundingPlanCategoriesSchema
