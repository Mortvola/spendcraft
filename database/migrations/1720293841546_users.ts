import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'users'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.json('roles').defaultTo('[]')
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        const users = await trx.from('users').where('admin', true);
    
        await Promise.all(users.map(async (user) => {
          await trx.from('users')
          .where('id', user.id)
          .update({
            roles: '["ADMIN"]',
          })
        }))
  
        await trx.commit();
      }
      catch (error) {
        console.log(error);
        await trx.rollback();
      }
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('roles')
    })
  }
}
