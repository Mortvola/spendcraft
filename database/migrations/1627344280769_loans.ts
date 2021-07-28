import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Loans extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.decimal('balance', 12, 2);
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('balance');
    })
  }
}
