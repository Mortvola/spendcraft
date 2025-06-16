import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Users extends BaseSchema {
  protected tableName = 'users'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('remember_me_token').nullable()
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('remember_me_token')
    })
  }
}
