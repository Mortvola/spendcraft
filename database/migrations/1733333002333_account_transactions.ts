import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('statement_id')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('statement_id')
    })
  }
}
