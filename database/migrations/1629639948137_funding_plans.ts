import { BaseSchema } from "@adonisjs/lucid/schema";

export default class FundingPlans extends BaseSchema {
  protected tableName = 'funding_plans'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('user_id').notNullable().references('id').inTable('users').alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.integer('user_id').notNullable();
    })
  }
}
