import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Users extends BaseSchema {
  protected tableName = 'users'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('account_status');
    	table.boolean('activated').notNullable().defaultTo(false);
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('activated');
      table.string('account_status');
    })
  }
}
