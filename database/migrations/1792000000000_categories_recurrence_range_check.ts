import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.check('recurrence BETWEEN 1 AND 360', undefined, 'categories_recurrence_range_check')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropChecks('categories_recurrence_range_check')
    })
  }
}
