import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Institutions extends BaseSchema {
  protected tableName = 'institutions'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('plaid_item_id').notNullable();
      table.integer('user_id');
      table.string('institution_id')
      table.string('name')
      table.string('access_token')

      /**
       * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
       */
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now()).notNullable()
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now()).notNullable()
    })
  }

  public async down () {
    this.schema.dropTable(this.tableName)
  }
}
