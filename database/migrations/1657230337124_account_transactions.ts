import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'account_transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.enum('provider', ['NONE', 'PLAID', 'OFX']).notNullable().defaultTo('NONE');
      table.renameColumn('plaid_transaction_id', 'provider_transaction_id');

      this.defer(async (db) => {
        await db.from(this.tableName)
          .update('provider', 'PLAID')
          .whereNotNull('provider_transaction_id');
      });    
    });
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('provider');
      table.renameColumn('provider_transaction_id', 'plaid_transaction_id');
    })
  }
}
