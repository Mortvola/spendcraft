import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('include_funding_transfers').defaultTo(true).notNullable()
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('include_funding_transfers')
    })
  }
}
