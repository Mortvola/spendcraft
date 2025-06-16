import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'institutions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('cursor').nullable();
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('cursor');
    })
  }
}
