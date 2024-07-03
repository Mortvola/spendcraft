import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'transaction_logs'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.json('changes')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('changes')
    })
  }
}
