import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Accounts extends BaseSchema {
  protected tableName = 'accounts'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('subtype').notNullable().alter();
      table.string('type').notNullable().alter();
  })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.string('subtype').alter();
      table.string('type').alter();
  })
  }
}
