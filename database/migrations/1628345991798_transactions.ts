import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Transactions extends BaseSchema {
  protected tableName = 'transactions'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('user_id').notNullable().references('id').inTable('users').alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (_table) => {
      //
    })
  }
}
