import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Loan extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('category_id').notNullable();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('category_id');
    })
  }
}
