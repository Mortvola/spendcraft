import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Categories extends BaseSchema {
  protected tableName = 'categories'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('group_id').notNullable().alter();
      table.string('name').notNullable().alter();
      table.decimal('amount', 12, 2).notNullable().alter();
  })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.integer('group_id').nullable().alter();
      table.string('name').nullable().alter();
      table.decimal('amount', 12, 2).nullable().alter();
    })
  }
}
