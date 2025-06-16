import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'auto_assignments'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('search_string', 'name')
      table.json('search_strings').notNullable().defaultTo('[]')
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        const source = await trx.from('auto_assignments');
    
        await Promise.all(source.map(async (s) => (
          await trx.from('auto_assignments')
            .where('id', s.id)
            .update({
              search_strings: `["${s.name}"]`,
            })
        )))
  
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
      table.renameColumn('name', 'search_string')
      table.dropColumn('search_strings')
    })
  }
}
