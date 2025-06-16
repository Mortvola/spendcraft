import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Categories extends BaseSchema {
  protected tableName = 'categories'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('type').notNullable().defaultTo('REGULAR');
      table.dropColumn('system');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('type');
      table.boolean('system').notNullable().defaultTo(false); 
    })
  }
}
