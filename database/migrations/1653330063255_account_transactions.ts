import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class AccountTransactions extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('reconciled').notNullable().defaultTo(false);
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('reconciled');
    })
  }
}
