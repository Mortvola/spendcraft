import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'transaction_categories'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('amount', 12, 2).notNullable().alter()
      table.decimal('expected', 12, 2)
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('amount').nullable().alter()
      table.dropColumn('expected')
    })
  }
}
