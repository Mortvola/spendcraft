import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class LoanTransactions extends BaseSchema {
  protected tableName = 'loan_transactions'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id');
      table.integer('transaction_id').notNullable().references('id').inTable('transactions');
      table.integer('loan_id').notNullable().references('id').inTable('loans');
      table.decimal('principle', 12, 2).notNullable();

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
