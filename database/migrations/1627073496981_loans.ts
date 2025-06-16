import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Loans extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable();
      table.double('rate').notNullable();
      table.integer('user_id').notNullable();
      table.integer('category_id').notNullable().references('id').inTable('categories');
      table.decimal('balance', 12, 2).notNullable();
      table.decimal('starting_balance', 12, 2).notNullable();
      table.date('start_date').notNullable();

      /**
       * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
       */
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now()).notNullable()
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now()).notNullable()
   })
  }

  public async down () {
    this.schema.dropTable(this.tableName)
  }
}
