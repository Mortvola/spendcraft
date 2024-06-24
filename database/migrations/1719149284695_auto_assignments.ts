import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'auto_assignments'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('search_string', 'name')
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('name', 'search_string')
    })
  }
}
