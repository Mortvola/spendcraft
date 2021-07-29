import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Loans extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.decimal('starting_balance', 12, 2);
      table.date('start_date');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('starting_balance');
      table.dropColumn('start_date');
    })
  }
}
