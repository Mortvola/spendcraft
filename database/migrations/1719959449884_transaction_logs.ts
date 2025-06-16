import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'transaction_logs'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.json('changes')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('changes')
    })
  }
}
