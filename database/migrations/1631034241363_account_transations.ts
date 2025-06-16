import { BaseSchema } from "@adonisjs/lucid/schema";

export default class AccountTransactions extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('merchant_name');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('merchantName');
    })
  }
}
