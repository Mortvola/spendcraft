import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = 'transaction_logs'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('application_id')
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        const source = await trx.from('transaction_logs');
    
        await Promise.all(source.map(async (log) => {
          const transaction = await trx.from('transactions')
            .where('id', log.transaction_id)
            .first()

          if (transaction) {
            await trx.from('transaction_logs')
            .where('id', log.id)
            .update({
              application_id: transaction.application_id,
            })
          }
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
      table.dropColumn('application_id')
    })
  }
}
