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
import Category from 'App/Models/Category';
import Institution from 'App/Models/Institution';
import { CategoryBalanceProps, TrackingType } from 'Common/ResponseTypes';
import User from 'App/Models/User';

type Transaction = {
  balance: number,
  sum: number,
  cat: {
    amount: number,
  },
}

type CategoryItem = {
  group: {
    id: number,
    name: string,
  },
  category: {
    id: number,
    name: string,
  },
  amount: number,
};

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

  @column()
  public startDate: string;

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

    if (this.tracking === 'Transactions') {
      // Retrieve the past 30 days of transactions
      // (unless the account start date is sooner)
      const startDate = moment.max(
        moment().subtract(30, 'days'),
        moment(this.startDate),
      );

      const details = await this.addTransactions(
        accessToken,
        startDate,
        user,
        { client: trx },
      );

      await this.updateAccountBalanceHistory(
        trx, details.balance,
      );

      if (details.cat) {
        const unassigned = await user.getUnassignedCategory({ client: trx });

        result.categories = [{ id: unassigned.id, balance: details.cat.amount }];
      }

      result.accounts = [{
        id: this.id,
        balance: details.balance,
        syncDate: this.syncDate,
      }];
    }
    else {
      const balanceResponse = await plaidClient.getBalance(accessToken, {
        account_ids: [this.plaidAccountId],
      });

      this.balance = balanceResponse.accounts[0].balances.current;

      await this.updateAccountBalanceHistory(
        trx, balanceResponse.accounts[0].balances.current,
      );

      result.accounts = [{
        id: this.id,
        balance: balanceResponse.accounts[0].balances.current,
        syncDate: this.syncDate,
      }];
    }

    await this.save();

    return result;
  }

  public async addTransactions(
    this: Account,
    accessToken: string,
    startDate: Moment,
    user: User,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<Transaction> {
    let trx: TransactionClientContract;

    if (options && options.client) {
      trx = options.client;
    }
    else {
      trx = await Database.transaction();
    }

    const pendingTransactions = await trx.query().select('transaction_id', 'plaid_transaction_id')
      .from('account_transactions')
      .where('account_id', this.id)
      .andWhere('pending', true);

    const transactionsResponse = await plaidClient.getTransactions(
      accessToken,
      startDate.format('YYYY-MM-DD'),
      moment().format('YYYY-MM-DD'),
      {
        count: 250,
        offset: 0,
        account_ids: [this.plaidAccountId],
      },
    );

    // console.log(JSON.stringify(transactionsResponse, null, 4));

    let sum = 0;
    // let pendingSum = 0;

    await Promise.all(transactionsResponse.transactions.map(async (transaction) => {
      // console.log(JSON.stringify(transaction, null, 4));
      // Only consider non-pending transactions
      // console.log(JSON.stringify(transaction, null, 4));

      if (transaction.amount !== null) {
        // First check to see if the transaction is present. If it is then don't insert it.
        const [{ exists }] = await trx.query().select(
          Database.raw(`EXISTS (SELECT 1 FROM account_transactions WHERE plaid_transaction_id = '${transaction.transaction_id}') AS exists`),
        );

        if (!exists) {
          // console.log('Insert transaction');

          const id = await trx.insertQuery().insert({
            date: transaction.date,
            user_id: user.id,
          })
            .table('transactions')
            .returning('id');

          // console.log(JSON.stringify(id, null, 4));

          await trx.insertQuery().insert({
            transaction_id: id[0],
            plaid_transaction_id: transaction.transaction_id,
            account_id: this.id,
            name: transaction.name,
            amount: -transaction.amount,
            pending: transaction.pending,
          })
            .table('account_transactions');

          if (!transaction.pending) {
            sum -= transaction.amount;
          }
        }

        const index = pendingTransactions.findIndex(
          (p) => p.plaid_transaction_id === transaction.transaction_id,
        );

        if (index !== -1) {
          pendingTransactions.splice(index, 1);
        }
      }
    }));

    // Delete any pending transaction in the database that remain in the array
    if (pendingTransactions.length > 0) {
      const transIds = pendingTransactions.map(
        (item) => item.transaction_id,
      );
      await trx.query().from('account_transactions')
        .whereIn('transaction_id', transIds)
        .delete();

      await trx.query().from('transactions').whereIn('id', transIds)
        .where('user_id', user.id)
        .delete();
    }

    let balance: number = transactionsResponse.accounts[0].balances.current;

    if (transactionsResponse.accounts[0].type === 'credit'
      || transactionsResponse.accounts[0].type === 'loan') {
      balance = -balance;
    //   sum = -sum;
    }

    let cat: CategoryItem | null = null;

    if (sum !== 0) {
      const unassigned = await user.getUnassignedCategory({ client: trx });

      // Add the sum of the transactions to the unassigned category.
      const category = await Category.findOrFail(unassigned.id, { client: trx });

      category.amount += sum;

      await category.save();

      cat = {
        group: {
          id: unassigned.groupId,
          name: 'System',
        },
        category: {
          id: category.id,
          name: category.name,
        },
        amount: category.amount,
      } as CategoryItem;
    }

    // console.log(`Balance: ${balance}, Pending: ${pendingSum}`);
    this.balance = balance;

    if (!options || !options.client) {
      trx.commit();
    }

    return { balance, sum, cat } as Transaction;
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
