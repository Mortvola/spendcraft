import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tax_categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.string('type').notNullable().unique()
      table.string('description').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}