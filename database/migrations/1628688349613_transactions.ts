import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Transaction extends BaseSchema {
  protected tableName = 'transactions'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.string('comment');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('comment');
    })
  }
}
