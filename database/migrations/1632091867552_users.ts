import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Users extends BaseSchema {
  protected tableName = 'users'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.integer('application_id').references('id').inTable('applications');
    });

    this.defer(async (db) => {
      const users = await db.from('users');

      await Promise.all(users.map(async (u) => {
        const [appId] = await db.table('applications')
          .insert({})
          .returning('id');

        return db.from('users')
          .where('id', u.id)
          .update({ application_id: appId })
      }))
    });
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign('application_id');
      table.dropColumn('application_id');
    })
  }
}
