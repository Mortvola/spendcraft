import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'institutions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      // alter table
      table.timestamp('sync_date');
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      // reverse alternations
      table.dropColumn('sync_date');
    })
  }
}
