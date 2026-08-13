import { BaseSchema } from '@adonisjs/lucid/schema'
import { DateTime } from 'luxon';

export default class extends BaseSchema {
  protected tableName = 'statements'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('data');
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        const accounts = await trx.from('accounts')
          .where('type', 'investment')
  
        for (const account of accounts) {
          const balances = await trx.from('balance_histories')
            .where('account_id', account.id)
            .orderBy('date', 'asc')

          for (let i = 0; i < balances.length; i += 1) {
            const balance = balances[i];
            const nextBalance = balances[i + 1];

            const data = {
                account_id: account.id,
                start_date: balance.date,
                end_date: nextBalance === undefined
                  ? DateTime.fromJSDate(balance.date).endOf('month')
                  : DateTime.fromJSDate(nextBalance.date).minus({ day: 1}),
                starting_balance: balance.balance,
                ending_balance: nextBalance === undefined
                  ? balance.balance
                  : nextBalance.balance,
              }

            await trx.table('statements')
              .insert(data)

            await trx.from('balance_histories')
              .where('id', balance.id)
              .delete()
          }
        }

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
      table.dropColumn('data')
    })
  }
}