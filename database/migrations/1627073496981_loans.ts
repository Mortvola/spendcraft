import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Loans extends BaseSchema {
  protected tableName = 'loans'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable();
      table.string('name').notNullable();
      table.decimal('amount', 12, 2).notNullable();
      table.double('rate').notNullable();
      table.integer('number_of_payments').notNullable();
      table.decimal('payment_amount', 12, 2).notNullable();
      table.integer('user_id').notNullable();

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
