import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Accounts extends BaseSchema {
  protected tableName = 'accounts'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.decimal('plaid_balance', 12, 2);
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('place_balance');
    })
  }
}
