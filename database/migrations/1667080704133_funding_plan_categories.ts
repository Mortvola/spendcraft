import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'funding_plan_categories'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('expected_to_spend', 12, 2).nullable()
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('expected_to_spend')
    })
  }
}
