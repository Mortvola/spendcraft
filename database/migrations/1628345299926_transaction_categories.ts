import { BaseSchema } from "@adonisjs/lucid/schema";

export default class TransactionCategories extends BaseSchema {
  protected tableName = 'transaction_categories'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('transaction_id').notNullable().references('id').inTable('transactions').alter();
      table.integer('category_id').notNullable().references('id').inTable('categories').alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (_table) => {
    })
  }
}
