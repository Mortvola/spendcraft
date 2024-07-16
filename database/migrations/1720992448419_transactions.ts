import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'transactions'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('categories').defaultTo('[]').notNullable()
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        const transactions = await trx.from('transactions');
    
        await Promise.all(transactions.map(async (transaction) => {
          const transactionCategories = await trx.from('transaction_categories').where('transaction_id', transaction.id);

          const newTransactionCategories: { categoryId: number, amount: number, comment?: string }[] = [];

          for (const trxCat of transactionCategories) {
            newTransactionCategories.push({
              categoryId: trxCat.category_id,
              amount: typeof trxCat.amount === 'string' ? parseFloat(trxCat.amount) : trxCat.amount,
              comment: trxCat.comment ?? undefined,
            })
          }

          await trx.from('transactions')
            .where('id', transaction.id)
            .update({ categories: JSON.stringify(newTransactionCategories)});
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
      table.dropColumn('categories')
    })
  }
}
