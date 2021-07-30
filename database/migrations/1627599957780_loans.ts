import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Loans extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('number_of_payments');
      table.dropColumn('payment_amount');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.integer('number_of_payments');
      table.decimal('payment_amount', 12, 2);
    })
  }
}
