import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Transactions extends BaseSchema {
  protected tableName = 'transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('deleted').notNullable().defaultTo(false);
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('deleted');
    })
  }
}
