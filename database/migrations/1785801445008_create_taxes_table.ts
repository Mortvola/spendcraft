import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'taxes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.integer('year').notNullable();

      table.jsonb('data').notNullable();
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}