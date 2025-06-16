import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Accounts extends BaseSchema {
  protected tableName = 'accounts'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.boolean('closed').defaultTo(false).notNullable();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('closed');
    })
  }
}
