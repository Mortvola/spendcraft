import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'transaction_categories'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('transaction_id')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.foreign('transaction_id').references('transactions.id')
    })
  }
}
