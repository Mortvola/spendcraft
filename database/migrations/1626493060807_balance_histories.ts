import { BaseSchema } from "@adonisjs/lucid/schema";

export default class BalanceHistories extends BaseSchema {
  protected tableName = 'balance_histories'

  public async up () {
      this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('account_id');
      table.date('date');
      table.decimal('balance', 12, 2);

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
