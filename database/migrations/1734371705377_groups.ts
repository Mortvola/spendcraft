import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'groups'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('parent_group_id')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('parent_group_id')
    })
  }
}
