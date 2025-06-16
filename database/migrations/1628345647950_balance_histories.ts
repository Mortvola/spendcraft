import { BaseSchema } from "@adonisjs/lucid/schema";

export default class BalanceHistories extends BaseSchema {
  protected tableName = 'balance_histories'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('account_id').notNullable().references('id').inTable('accounts').alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (_table) => {
    })
  }
}
