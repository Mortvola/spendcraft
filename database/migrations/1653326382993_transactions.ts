import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Transactions extends BaseSchema {
  protected tableName = 'transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('date').notNullable().alter();
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('date').nullable().alter();
    })
  }
}
