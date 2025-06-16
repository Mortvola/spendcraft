import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Groups extends BaseSchema {
  protected tableName = 'groups'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('type').notNullable().defaultTo('REGULAR');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('type');
    })
  }
}
