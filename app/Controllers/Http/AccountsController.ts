import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Account from 'App/Models/Account';
import AccountTransaction from 'App/Models/AccountTransaction';
import BalanceHistory from 'App/Models/BalanceHistory';
import Category from 'App/Models/Category';
import Transaction from 'App/Models/Transaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import { CategoryBalanceProps, TransactionType } from 'Common/ResponseTypes';

type Transactions = {
  transactions: Transaction[],
  pending: Transaction[],
  balance: number,
};

export default class AccountsController {
  // eslint-disable-next-line class-methods-use-this
  public async transactions({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Transactions> {
    if (!user) {
      throw new Error('user not defined');
    }

    const accountId = parseInt(request.params().acctId, 10);

    const result: Transactions = {
      transactions: [],
      pending: [],
      balance: 0,
    };

    // Determine if the account belongs to the authenticated user
    // and get the balance
    const acct = await Account.findOrFail(accountId);

    result.balance = acct.balance;

    const transactions = await user
      .related('transactions').query()
      .whereHas('accountTransaction', (query) => {
        query.where('account_id', accountId);
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories', (transactionCategory) => {
        transactionCategory.preload('loanTransaction');
      });

    // const transactions = await account.related('accountTransactions')
    //   .query()
    //   .select(
    //     'account_transactions.*',
    //     Database.raw("to_char(date  AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS date"),
    //     'transaction_id',
    //   )
    //   .join('transactions', 'transactions.id', 'transaction_id')
    //   .orderBy('account_transactions.pending', 'desc')
    //   .orderBy('transactions.date', 'desc')
    //   .orderBy('account_transactions.name');

    result.transactions = transactions;

    // if (result.transactions.length > 0) {
    //   // Move pending transactions to the pending array
    //   // Find first transaction that is not pending (all pending
    //   // should be up front in the array)
    //   const index = result.transactions.findIndex((t) => !t.pending);

    //   if (index === -1) {
    //     // The array contains only pending transactions
    //     result.pending = result.transactions;
    //     result.transactions = [];
    //   }
    //   else if (index > 0) {
    //     // The array contains at least one pending transaction
    //     result.pending = result.transactions.splice(0, index);
    //   }

    //   const transctionIds = result.transactions.map((t) => t.transactionId);

    //   const categories = await TransactionCategory.query().whereIn('transaction_id', transctionIds);

    //   result.transactions.forEach((transaction) => {
    //     transaction.$extras.categories = categories.filter(
    //       (c) => c.transactionId === transaction.transactionId,
    //     );
    //   });
    // }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async balances({ request }: HttpContextContract): Promise<Array<BalanceHistory>> {
    const accountId = parseInt(request.params().acctId, 10);
    const account = await Account.find(accountId);

    if (account) {
      await account.load('balanceHistory', (query) => {
        query.orderBy('date', 'asc');
      });

      return account.balanceHistory;
    }

    return [];
  }

  public async addTransaction({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user not defined');
    }

    const trx = await Database.transaction();

    const account = await Account.findOrFail(request.params().acctId, { client: trx });

    const transaction  = (new Transaction()).useTransaction(trx);

    transaction.fill({
      type: TransactionType.MANUAL_TRANSACTION,
      date: request.input('date'),
      sortOrder: 2147483647,
    });

    await transaction.related('user').associate(user);

    const acctTransaction = await account.related('accountTransactions').create({
      name: request.input('name'),
      transactionId: transaction.id,
      amount: request.input('amount'),
    });

    account.balance += acctTransaction.amount;

    await account.save();

    const categoryBalances: CategoryBalanceProps[] = [];
  
    const splits = request.input('splits');

    if (!splits || splits.length === 0) {
      const unassignedCat = await Category.getUnassignedCategory(user, { client: trx });

      unassignedCat.amount += acctTransaction.amount;
  
      await unassignedCat.save();

      categoryBalances.push({ id: unassignedCat.id, balance: unassignedCat.amount })
    }
    else {
      for (let split of splits) {
        const trxCategory = (new TransactionCategory()).useTransaction(trx);

        trxCategory.fill({
          transactionId: transaction.id,
          categoryId: split.categoryId,
          amount: split.amount,
        })

        await trxCategory.save();

        const category = await Category.findOrFail(split.categoryId, { client: trx });

        category.amount += split.amount;

        await category.save();

        const balance = categoryBalances.find((b) => b.id === category.id);

        if (balance) {
          balance.balance = category.amount;
        }
        else {
          categoryBalances.push({ id: split.categoryId, balance: category.amount });
        }
      }
    }

    await transaction.load('accountTransaction', (acctTrx) => {
      acctTrx.preload('account', (acct) => {
        acct.preload('institution')
      })
    });

    await transaction.load('transactionCategories');
  
    await trx.commit();

    const result: {
      categories: CategoryBalanceProps[],
      transaction: Transaction,
      balance: number,
    } = {
      categories: categoryBalances,
      transaction,
      balance: account.balance,
    };

    return result;
  }
}
