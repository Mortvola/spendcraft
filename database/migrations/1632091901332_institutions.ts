import { BaseSchema } from "@adonisjs/lucid/schema";

export default class Institutions extends BaseSchema {
  protected tableName = 'institutions'

  public async up () {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign('user_id');
      table.renameColumn('user_id', 'application_id');
    });


    this.defer(async (db) => {
      const users = await this.db.from('users');

      await Promise.all(users.map((u) => (
        db.from(this.tableName)
          .where('application_id', u.id)
          .update('application_id', u.application_id)
      )));
    });

    this.schema.table(this.tableName, (table) => {
      table.foreign('application_id').references('id').inTable('applications');
    })
  }

  public async down () {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign('application_id');
    })

    this.defer(async (db) => {
      const users = await this.db.from('users');

      await Promise.all(users.map((u) => (
        db.from(this.tableName)
          .where('application_id', u.application_id)
          .update('application_id', u.id)
      )));
    });

    this.schema.table(this.tableName, (table) => {
      table.renameColumn('application_id', 'user_id');
      table.foreign('user_id').references('id').inTable('users');
    })
  }
}
