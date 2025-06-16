import { BaseSchema } from "@adonisjs/lucid/schema";

export default class FundingPlanCategory extends BaseSchema {
  protected tableName = 'funding_plan_categories';

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.boolean('use_goal').notNullable().defaultTo(false);
      table.date('goal_date');
      table.integer('recurrence').notNullable().defaultTo(1);
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('use_goal');
      table.dropColumn('goal_date');
      table.dropColumn('recurrence');
    })
  }
}
