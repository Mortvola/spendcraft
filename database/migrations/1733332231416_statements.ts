import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'statements'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      /**
       * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
       */
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })

      table.integer('account_id').notNullable()
      table.date('start_date').notNullable()
      table.date('end_date').notNullable()
      table.decimal('starting_balance', 12, 2).notNullable()
      table.decimal('ending_balance', 12, 2).notNullable()
    })
  }

  public async down () {
    this.schema.dropTable(this.tableName)
  }
}
