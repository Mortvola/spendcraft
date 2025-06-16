import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Accounts extends BaseSchema {
  protected tableName = 'accounts'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.decimal('rate', 5, 3);
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('rate');
    })
  }
}
