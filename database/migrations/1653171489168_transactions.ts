import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Transactions extends BaseSchema {
  protected tableName = 'transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('deleted').notNullable().defaultTo(false);
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('deleted');
    })
  }
}
