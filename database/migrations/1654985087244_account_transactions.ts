import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('principle', 12, 2);
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('principle');
    })
  }
}
