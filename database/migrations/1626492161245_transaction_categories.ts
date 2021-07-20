import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class TransactionCategories extends BaseSchema {
  protected tableName = 'transaction_categories'

  public async up () {
    if (!this.schema.hasTable(this.tableName)) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id')
        table.integer('transaction_id')
        table.integer('category_id')
        table.decimal('amount', 12, 2)

        /**
         * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
         */
        table.timestamp('created_at', { useTz: true }).defaultTo(this.now()).notNullable()
        table.timestamp('updated_at', { useTz: true }).defaultTo(this.now()).notNullable()
      })
    }
  }

  public async down () {
    this.schema.dropTable(this.tableName)
  }
}
