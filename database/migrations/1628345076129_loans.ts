import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Loans extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('user_id').notNullable().references('id').inTable('users').alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (_table) => {
    })
  }
}
