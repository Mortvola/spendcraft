import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class FundingPlans extends BaseSchema {
  protected tableName = 'funding_plans'

  public async up () {
    //if (!this.schema.hasTable(this.tableName)) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id')
        table.string('name').notNullable();
        table.integer('user_id').notNullable();

        /**
         * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
         */
        table.timestamp('created_at', { useTz: true }).defaultTo(this.now()).notNullable()
        table.timestamp('updated_at', { useTz: true }).defaultTo(this.now()).notNullable()
      })
    //}
  }

  public async down () {
    if (await this.schema.hasTable(this.tableName)) {
      this.schema.dropTable(this.tableName);
    }
  }
}
