import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
import moment, { Moment } from 'moment';
import {
  BaseModel, hasMany, HasMany, column,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';
import plaidClient from '@ioc:Plaid';
import AccountTransaction from 'App/Models/AccountTransaction';
import BalanceHistory from 'App/Models/BalanceHistory';

type Transaction = {
  balance: number,
  sum: number,
  cat: {
    amount: number,
  },
}

type Category = {
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

type CategoryBalance = {
  id: number,
  amount: number,
};

export type AccountSyncResult = {
  categories: Array<CategoryBalance>,
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
  public institutionId;

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
  public tracking: string;

  @column()
  public startDate: string;

  @column({
    consume: (value: string) => (value ? parseFloat(value) : 0),
  })
  public balance: number;

  @column()
  public enabled: boolean;

  // eslint-disable-next-line class-methods-use-this
  public async getBalance(balance: string): Promise<number> {
    return parseFloat(balance);
  }

  public async sync(
    this: Account,
    trx: TransactionClientContract,
    accessToken: string,
    userId: number,
  ): Promise<AccountSyncResult | null> {
    this.useTransaction(trx);

    const result: AccountSyncResult = {
      categories: [],
      accounts: [],
    };

    this.syncDate = moment().format('YYYY-MM-DD hh:mm:ss');

    if (this.tracking === 'Transactions') {
      // Retrieve the past 30 days of transactions
      // (unles the account start date is sooner)
      const startDate = moment.max(
        moment().subtract(30, 'days'),
        moment(this.startDate),
      );

      const details = await this.addTransactions(
        trx,
        accessToken,
        startDate,
        userId,
      );

      await this.updateAccountBalanceHistory(
        trx, details.balance,
      );

      if (details.cat) {
        const systemCats = await trx.query()
          .select('cats.id AS id', 'cats.name AS name')
          .from('categories AS cats')
          .join('groups', 'groups.id', 'group_id')
          .where('cats.system', true)
          .andWhere('groups.user_id', userId);
        const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

        result.categories = [{ id: unassigned.id, amount: details.cat.amount }];
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
    trx: TransactionClientContract,
    accessToken: string,
    startDate: Moment,
    userId: number,
  ): Promise<Transaction> {
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

    console.log(JSON.stringify(transactionsResponse, null, 4));

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
            user_id: userId,
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
            sum += transaction.amount;
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
        .where('user_id', userId)
        .delete();
    }

    let balance: number = transactionsResponse.accounts[0].balances.current;

    let cat: Category | null = null;

    if (sum !== 0) {
      const systemCats = await trx.query()
        .select('cats.id AS id', 'cats.name AS name')
        .from('categories AS cats')
        .join('groups', 'groups.id', 'group_id')
        .where('cats.system', true)
        .andWhere('groups.user_id', userId);
      const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

      // Add the sum of the transactions to the unassigned category.
      cat = await Account.subtractFromCategoryBalance(trx, unassigned.id, sum);
    }

    if (transactionsResponse.accounts[0].type === 'credit'
      || transactionsResponse.accounts[0].type === 'loan') {
      balance = -balance;
    }

    // console.log(`Balance: ${balance}, Pending: ${pendingSum}`);
    this.balance = balance;

    return { balance, sum, cat } as Transaction;
  }

  public static async subtractFromCategoryBalance(
    trx: TransactionClientContract, categoryId: number, amount: number,
  ): Promise<Category> {
    const result = await trx.query()
      .select(
        'groups.id AS groupId',
        'groups.name AS group',
        'cat.id AS categoryId',
        'cat.name AS category',
        'cat.amount AS amount',
      )
      .from('categories AS cat')
      .leftJoin('groups', 'groups.id', 'cat.group_id')
      .where('cat.id', categoryId);

    const newAmount = result[0].amount - amount;

    await trx.query().from('categories').where('id', categoryId).update('amount', newAmount);

    return {
      group: {
        id: result[0].groupId,
        name: result[0].group,
      },
      category: {
        id: result[0].categoryId,
        name: result[0].category,
      },
      amount: newAmount,
    } as Category;
  }

  public async updateAccountBalanceHistory(
    this: Account, trx: TransactionClientContract, balance: number,
  ): Promise<void> {
    const today = DateTime.utc();

    await this.preload('balanceHistory', (query) => {
      query.where('date', today.toFormat('yyyy-MM-dd')).useTransaction(trx);
    });

    if (this.balanceHistory.length === 0) {
      await BalanceHistory.create({ date: today, balance }, { client: trx });
    }
  }
}

export default Account;
