import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Transactions extends BaseSchema {
  protected tableName = 'transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('date').notNullable().alter();
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('date').nullable().alter();
    })
  }
}
