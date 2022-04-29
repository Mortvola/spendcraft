/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany, column, belongsTo, BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import Logger from '@ioc:Adonis/Core/Logger'
import { DateTime } from 'luxon';
import plaidClient, { PlaidTransaction } from '@ioc:Plaid';
import AccountTransaction from 'App/Models/AccountTransaction';
import BalanceHistory from 'App/Models/BalanceHistory';
import Institution from 'App/Models/Institution';
import { CategoryBalanceProps, TrackingType } from 'Common/ResponseTypes';
import Transaction from 'App/Models/Transaction';
import Application from 'App/Models/Application';
import { Exception } from '@poppinss/utils';

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

  @column()
  closed: boolean;

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

  public async sync(
    this: Account,
    accessToken: string,
    application: Application,
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
        application,
      );

      this.balance += sum;

      await this.updateAccountBalanceHistory(this.balance);

      const unassigned = await application.getUnassignedCategory({ client: trx });
      result.categories = [{ id: unassigned.id, balance: unassigned.amount }];

      result.accounts = [{
        id: this.id,
        balance: this.balance,
        plaidBalance: this.plaidBalance,
        syncDate: this.syncDate,
      }];
    }
    else {
      await this.updateBalance(accessToken);

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

  public async updateBalance(
    accessToken: string,
  ): Promise<void> {
    const accountsResponse = await plaidClient.getAccounts(accessToken, {
      account_ids: [this.plaidAccountId],
    });

    if (accountsResponse.accounts[0].balances.current === null) {
      throw new Exception('Balance is null');
    }

    this.balance = accountsResponse.accounts[0].balances.current;
    this.plaidBalance = accountsResponse.accounts[0].balances.current;
    if (this.plaidBalance && (this.type === 'credit' || this.type === 'loan')) {
      this.plaidBalance = -this.plaidBalance;
    }

    await this.updateAccountBalanceHistory(this.balance);

    this.syncDate = DateTime.now();
  }

  public async addTransactions(
    this: Account,
    accessToken: string,
    startDate: DateTime,
    application: Application,
  ): Promise<number> {
    const pendingTransactions = await this.related('accountTransactions')
      .query()
      .where('pending', true)
      .preload('transaction');

    console.log(`plaid account id: ${this.plaidAccountId}`);

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

    if (
      transactionsResponse.accounts.length === 1
      && transactionsResponse.accounts[0].account_id !== this.plaidAccountId
    ) {
      // The plaid account ID has changed. Update the account with the new ID
      Logger.info(`Changed plaid account id from ${this.plaidAccountId} to ${transactionsResponse.accounts[0].account_id}`)
      this.plaidAccountId = transactionsResponse.accounts[0].account_id;
    }

    const sum = await this.applyTransactions(application, transactionsResponse.transactions, pendingTransactions);

    console.log(JSON.stringify(transactionsResponse.accounts[0]));
    this.plaidBalance = transactionsResponse.accounts[0].balances.current;
    if (this.plaidBalance && (this.type === 'credit' || this.type === 'loan')) {
      this.plaidBalance = -this.plaidBalance;
    }

    this.syncDate = DateTime.now();

    return sum;
  }

  // eslint-disable-next-line class-methods-use-this
  public async applyTransactions(
    this: Account,
    application: Application,
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
            merchantName: plaidTransaction.merchant_name,
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
              applicationId: application.id,
            })
            .save();

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
              merchantName: plaidTransaction.merchant_name,
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
      const unassigned = await application.getUnassignedCategory({ client: this.$trx });

      unassigned.amount += sum;

      unassigned.save();
    }

    return sum;
  }

  public async updateAccountBalanceHistory(
    this: Account,
    balance: number,
  ): Promise<void> {
    const today = DateTime.utc();

    const history = await this.related('balanceHistory')
      .query()
      .where('date', today.toFormat('yyyy-MM-dd'))
      .first();

    // If the history record was not found then create one.
    // Otherwise, update the one that was found (if the balance has
    // changed).
    if (history === null) {
      await (await this.related('balanceHistory')
        .create({ date: today, balance }))
        .save();
    }
    else if (history.balance !== balance) {
      history.balance = balance;
      await history.save();
    }
  }
}

export default Account;
