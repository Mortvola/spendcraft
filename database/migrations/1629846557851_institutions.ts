import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Institutions extends BaseSchema {
  protected tableName = 'institutions'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('plaid_item_id').nullable().alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.string('plaid_item_id').notNullable().alter();
    })
  }
}
