import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class FundingPlanCategories extends BaseSchema {
  protected tableName = 'funding_plan_categories'

  public async up () {
    //if (!this.schema.hasTable(this.tableName)) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id')
        table.integer('plan_id').notNullable();
        table.integer('category_id').notNullable();
        table.decimal('amount', 12, 2).notNullable();

        /**
         * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
         */
        table.timestamp('created_at', { useTz: true }).defaultTo(this.now()).notNullable()
        table.timestamp('updated_at', { useTz: true }).defaultTo(this.now()).notNullable()
      })
    //}
  }

  public async down () {
    if (this.schema.hasTable(this.tableName)) {
      this.schema.dropTable(this.tableName)
    }
  }
}
