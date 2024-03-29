import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class TransactionCategories extends BaseSchema {
  protected tableName = 'transaction_categories'

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
