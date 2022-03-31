import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Accounts extends BaseSchema {
  protected tableName = 'accounts'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.timestamp('sync_date');
      table.string('plaid_account_id')
      table.string('name')
      table.string('official_name')
      table.string('mask')
      table.string('subtype')
      table.string('type')
      table.integer('institution_id')
      table.date('start_date')
      table.decimal('balance', 12, 2)
      table.boolean('enabled')
      table.string('tracking')
    
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
