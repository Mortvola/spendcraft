import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Loans extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('name');
      table.dropColumn('amount');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.string('name');
      table.decimal('amount', 12, 2);
    })
  }
}
