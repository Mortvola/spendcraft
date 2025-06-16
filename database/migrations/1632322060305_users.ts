import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Users extends BaseSchema {
  protected tableName = 'users'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('pending_email');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('pending_email');
    })
  }
}
