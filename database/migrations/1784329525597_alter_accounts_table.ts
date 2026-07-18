import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'accounts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('initialized').notNullable().defaultTo(false)
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        await trx.from('accounts')
          .update({ initialized: true })
  
        await trx.commit();
      }
      catch (error) {
        console.log(error);
        await trx.rollback();
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('initialized')
    })
  }
}