import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'auto_assignment_search_strings'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      /**
       * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
       */
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })

      table.integer('auto_assignment_id').notNullable()

      table.string('search_string').notNullable()
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        const source = await trx.from('auto_assignments');
    
        await Promise.all(source.map(async (s) => (
          await trx.table('auto_assignment_search_strings')
          .insert({
            auto_assignment_id: s.id,
            search_string: s.search_string,
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
    this.schema.dropTable(this.tableName)
  }
}
