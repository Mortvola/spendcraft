import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('amount', 'balance')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('balance', 'amount')
    })
  }
}
