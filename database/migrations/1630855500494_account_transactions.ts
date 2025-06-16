import { BaseSchema } from "@adonisjs/lucid/schema";

export default class AccountTransactions extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('payment_channel');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('payment_channel');
    })
  }
}
