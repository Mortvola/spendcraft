/* eslint-disable import/no-cycle */
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
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
import { Transaction as PlaidTransaction } from 'plaid';

export type AccountSyncResult = {
  categories: CategoryBalanceProps[],
  accounts: {
    id: number,
    balance: number,
    plaidBalance: number | null,
    syncDate: DateTime,
  }[],
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

  @column.dateTime()
  public syncDate: DateTime;

  @column()
  public tracking: TrackingType;

  @column.date()
  public startDate: DateTime;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public plaidBalance: number | null;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public rate: number | null;

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

      await this.updateAccountBalanceHistory(this.balance);

      const unassigned = await user.getUnassignedCategory({ client: trx });
      result.categories = [{ id: unassigned.id, balance: unassigned.amount }];

      result.accounts = [{
        id: this.id,
        balance: this.balance,
        plaidBalance: this.plaidBalance,
        syncDate: this.syncDate,
      }];
    }
    else {
      const balanceResponse = await plaidClient.getBalance(accessToken, {
        account_ids: [this.plaidAccountId],
      });

      this.balance = balanceResponse.accounts[0].balances.current;
      this.plaidBalance = balanceResponse.accounts[0].balances.current;
      if (this.type === 'credit' || this.type === 'loan') {
        this.plaidBalance = -this.plaidBalance;
      }

      await this.updateAccountBalanceHistory(this.balance);

      this.syncDate = DateTime.now();

      result.accounts = [{
        id: this.id,
        balance: this.balance,
        plaidBalance: this.plaidBalance,
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

    const sum = await this.applyTransactions(user, transactionsResponse.transactions, pendingTransactions);

    this.plaidBalance = transactionsResponse.accounts[0].balances.current;
    if (this.type === 'credit' || this.type === 'loan') {
      this.plaidBalance = -this.plaidBalance;
    }

    this.syncDate = DateTime.now();

    if (!options || !options.client) {
      await trx.commit();
    }

    return sum;
  }

  // eslint-disable-next-line class-methods-use-this
  public async applyTransactions(
    this: Account,
    user: User,
    plaidTransactions: PlaidTransaction[],
    pendingTransactions?: AccountTransaction[],
  ): Promise<number> {
    if (!this.$trx) {
      throw new Error('database transaction not set');
    }

    let sum = 0;
    // let pendingSum = 0;

    await Promise.all(plaidTransactions.map(async (plaidTransaction) => {
      if (!this.$trx) {
        throw new Error('database transaction not set');
      }

      // console.log(JSON.stringify(transaction, null, 4));
      // Only consider non-pending transactions
      // console.log(JSON.stringify(transaction, null, 4));

      if (plaidTransaction.amount !== null) {
        // First check to see if the transaction is present. If it is then don't insert it.
        let acctTrans = await AccountTransaction
          .findBy('plaidTransactionId', plaidTransaction.transaction_id, { client: this.$trx });

        if (acctTrans) {
          // If the existing transaction was pending
          // and the Plaid transaction is not then remove
          // the transaction from the pending transaction array.
          if (pendingTransactions && acctTrans.pending && !plaidTransaction.pending) {
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
            paymentChannel: plaidTransaction.payment_channel,
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
            .useTransaction(this.$trx)
            .fill({
              date: DateTime.fromISO(plaidTransaction.date),
              userId: user.id,
            })
            .save();

          // console.log(JSON.stringify(id, null, 4));

          acctTrans = await (new AccountTransaction())
            .useTransaction(this.$trx)
            .fill({
              transactionId: transaction.id,
              plaidTransactionId: plaidTransaction.transaction_id,
              accountId: this.id,
              name: plaidTransaction.name ?? undefined,
              amount: -plaidTransaction.amount,
              pending: plaidTransaction.pending ?? false,
              paymentChannel: plaidTransaction.payment_channel,
            })
            .save();

          if (!plaidTransaction.pending) {
            sum += acctTrans.amount;
          }
        }
      }
    }));

    // Delete any pending transaction in the database that remain in the array
    if (pendingTransactions && pendingTransactions.length > 0) {
      await Promise.all(pendingTransactions.map(async (pt): Promise<void> => {
        await pt.delete();
        return pt.transaction.delete();
      }));
    }

    if (sum !== 0 && this.tracking === 'Transactions') {
      const unassigned = await user.getUnassignedCategory({ client: this.$trx });

      unassigned.amount += sum;

      unassigned.save();
    }

    return sum;
  }

  public async updateAccountBalanceHistory(
    this: Account,
    balance: number,
  ): Promise<void> {
    if (!this.$trx) {
      throw new Error('database transaction not set');
    }

    const today = DateTime.utc();

    await this.load('balanceHistory', (query) => {
      if (!this.$trx) {
        throw new Error('database transaction not set');
      }

      query.where('date', today.toFormat('yyyy-MM-dd')).useTransaction(this.$trx);
    });

    if (this.balanceHistory.length === 0) {
      await this.related('balanceHistory').create({ date: today, balance });
    }
  }
}

export default Account;
