import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class LoanTransactions extends BaseSchema {
  protected tableName = 'loan_transactions'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('transaction_id');
      table.dropColumn('amount');
      table.integer('transaction_category_id').notNullable();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('transaction_category_id');
      table.integer('transaction_id');
      table.decimal('amount', 12, 2);
    })
  }
}
