import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.json('location');
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('location');
    })
  }
}
