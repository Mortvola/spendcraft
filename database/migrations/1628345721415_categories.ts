import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Categories extends BaseSchema {
  protected tableName = 'categories'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('group_id').notNullable().references('id').inTable('groups').alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (_table) => {
      //
    })
  }
}
