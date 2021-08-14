import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Accounts extends BaseSchema {
  protected tableName = 'accounts'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('institution_id').notNullable().references('id').inTable('institutions').alter();
    })
  }

  public async down () {
    this.schema.table(this.tableName, (_table) => {
    })
  }
}
