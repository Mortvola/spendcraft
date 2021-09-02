/* eslint-disable import/no-cycle */
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
import moment, { Moment } from 'moment';
import {
  BaseModel, hasMany, HasMany, column, belongsTo, BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';
import plaidClient from '@ioc:Plaid';
import AccountTransaction from 'App/Models/AccountTransaction';
import BalanceHistory from 'App/Models/BalanceHistory';
import Institution from 'App/Models/Institution';
import { CategoryBalanceProps, TrackingType } from 'Common/ResponseTypes';
import User from 'App/Models/User';
import Transaction from 'App/Models/Transaction';

export type AccountSyncResult = {
  categories: CategoryBalanceProps[],
  accounts: Array<{
    id: number,
    balance: number,
    syncDate: string,
  }>
};

class Account extends BaseModel {
  @column()
  public id: number;

  @hasMany(() => AccountTransaction)
  public accountTransactions: HasMany<typeof AccountTransaction>;

  @hasMany(() => BalanceHistory)
  public balanceHistory: HasMany<typeof BalanceHistory>;

  @column()
  public institutionId: number;

  @column()
  public plaidAccountId: string;

  @column()
  public name: string;

  @column()
  public officialName: string | null;

  @column()
  public mask: string | null;

  @column()
  public subtype: string;

  @column()
  public type: string;

  @column()
  public syncDate: string;

  @column()
  public tracking: TrackingType;

  @column.date()
  public startDate: DateTime;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column()
  public enabled: boolean;

  @belongsTo(() => Institution)
  public institution: BelongsTo<typeof Institution>;

  // eslint-disable-next-line class-methods-use-this
  public async getBalance(balance: string): Promise<number> {
    return parseFloat(balance);
  }

  public async sync(
    this: Account,
    accessToken: string,
    user: User,
  ): Promise<AccountSyncResult | null> {
    const result: AccountSyncResult = {
      categories: [],
      accounts: [],
    };

    const trx = this.$trx;
    if (trx === undefined) {
      throw new Error('transaction not defined');
    }

    this.syncDate = moment().format('YYYY-MM-DD hh:mm:ss');

    if (this.tracking !== 'Balances') {
      // Retrieve the past 30 days of transactions
      // (unless the account start date is sooner)
      let startDate: DateTime;

      const newest = await Transaction.query()
        .useTransaction(trx)
        .whereHas('accountTransaction', (query) => {
          query.where('accountId', this.id)
        })
        .orderBy('date', 'desc')
        .first();

      if (newest === null) {
        startDate = DateTime.now().minus({ days: 30 });
      }
      else {
        startDate = newest.date.minus({ days: 14 });
      }

      startDate = DateTime.max(startDate, this.startDate);

      const sum = await this.addTransactions(
        accessToken,
        startDate,
        user,
        { client: trx },
      );

      this.balance += sum;

      await this.updateAccountBalanceHistory(
        trx, this.balance,
      );

      const unassigned = await user.getUnassignedCategory({ client: trx });
      result.categories = [{ id: unassigned.id, balance: unassigned.amount }];

      result.accounts = [{
        id: this.id,
        balance: this.balance,
        syncDate: this.syncDate,
      }];
    }
    else {
      const balanceResponse = await plaidClient.getBalance(accessToken, {
        account_ids: [this.plaidAccountId],
      });

      this.balance = balanceResponse.accounts[0].balances.current;

      await this.updateAccountBalanceHistory(
        trx, this.balance,
      );

      result.accounts = [{
        id: this.id,
        balance: this.balance,
        syncDate: this.syncDate,
      }];
    }

    await this.save();

    return result;
  }

  public async addTransactions(
    this: Account,
    accessToken: string,
    startDate: DateTime,
    user: User,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<number> {
    let trx: TransactionClientContract;

    if (options && options.client) {
      trx = options.client;
    }
    else {
      trx = await Database.transaction();
    }

    if (!this.$trx) {
      this.useTransaction(trx);
    }

    const pendingTransactions = await this.related('accountTransactions')
      .query()
      .where('pending', true)
      .preload('transaction');

    const transactionsResponse = await plaidClient.getTransactions(
      accessToken,
      startDate.toISODate(),
      DateTime.now().toISODate(),
      {
        count: 250,
        offset: 0,
        account_ids: [this.plaidAccountId],
      },
    );

    // console.log(JSON.stringify(transactionsResponse, null, 4));

    let sum = 0;
    // let pendingSum = 0;

    await Promise.all(transactionsResponse.transactions.map(async (plaidTransaction) => {
      // console.log(JSON.stringify(transaction, null, 4));
      // Only consider non-pending transactions
      // console.log(JSON.stringify(transaction, null, 4));

      if (plaidTransaction.amount !== null) {
        // First check to see if the transaction is present. If it is then don't insert it.
        let acctTrans = await AccountTransaction
          .findBy('plaidTransactionId', plaidTransaction.transaction_id, { client: trx });

        if (acctTrans) {
          // If the existing transaction was pending
          // and the Plaid transaction is not then remove
          // the transaction from the pending transaction array.
          if (acctTrans.pending && !plaidTransaction.pending) {
            const index = pendingTransactions.findIndex(
              (p) => p.plaidTransactionId === plaidTransaction.transaction_id,
            );

            if (index !== -1) {
              pendingTransactions.splice(index, 1);
            }
          }

          // todo: check to see if any of these attributes have changed
          acctTrans.merge({
            name: plaidTransaction.name ?? undefined,
            amount: -plaidTransaction.amount,
            pending: plaidTransaction.pending ?? false,
          });

          await acctTrans.save();

          const transaction = await Transaction.findOrFail(acctTrans.transactionId);

          transaction.merge({
            date: DateTime.fromISO(plaidTransaction.date),
          });

          await transaction.save();
        }
        else {
          const transaction = await (new Transaction())
            .useTransaction(trx)
            .fill({
              date: DateTime.fromISO(plaidTransaction.date),
              userId: user.id,
            })
            .save();

          // console.log(JSON.stringify(id, null, 4));

          acctTrans = await (new AccountTransaction())
            .useTransaction(trx)
            .fill({
              transactionId: transaction.id,
              plaidTransactionId: plaidTransaction.transaction_id,
              accountId: this.id,
              name: plaidTransaction.name ?? undefined,
              amount: -plaidTransaction.amount,
              pending: plaidTransaction.pending ?? false,
            })
            .save();

          if (!plaidTransaction.pending) {
            sum += acctTrans.amount;
          }
        }
      }
    }));

    // Delete any pending transaction in the database that remain in the array
    if (pendingTransactions.length > 0) {
      await Promise.all(pendingTransactions.map(async (pt): Promise<void> => {
        await pt.transaction.delete();
        return pt.delete();
      }));
    }

    if (sum !== 0 && this.tracking === 'Transactions') {
      const unassigned = await user.getUnassignedCategory({ client: trx });

      unassigned.amount += sum;

      unassigned.save();
    }

    if (!options || !options.client) {
      await trx.commit();
    }

    return sum;
  }

  public async updateAccountBalanceHistory(
    this: Account, trx: TransactionClientContract, balance: number,
  ): Promise<void> {
    const today = DateTime.utc();

    await this.load('balanceHistory', (query) => {
      query.where('date', today.toFormat('yyyy-MM-dd')).useTransaction(trx);
    });

    if (this.balanceHistory.length === 0) {
      await this.related('balanceHistory').create({ date: today, balance });
    }
  }
}

export default Account;
