import { BaseSchema } from "@adonisjs/lucid/schema";

export default class AccountTransactions extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.boolean('pending').notNullable().defaultTo(false);
      table.integer('account_id');
      table.integer('transaction_id');
      table.string('plaid_transaction_id');
      table.string('name');
      table.decimal('amount', 12, 2);

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
