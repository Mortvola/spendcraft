import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class FundingPlanCategories extends BaseSchema {
  protected tableName = 'funding_plan_categories'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('plan_id').notNullable().references('id').inTable('funding_plans').alter();
      table.integer('category_id').notNullable().references('id').inTable('categories').alter();
  })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.integer('plan_id').notNullable();
      table.integer('category_id').notNullable();
    })
  }
}
