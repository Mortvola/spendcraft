import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'plaid_logs'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('institution_id')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('institution_id')
    })
  }
}
