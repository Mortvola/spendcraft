import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema } from '@ioc:Adonis/Core/Validator';
import Database from '@ioc:Adonis/Lucid/Database';
import Account from 'App/Models/Account';
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
        query.where('account_id', accountId)
          .andWhere('pending', false);
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories', (transactionCategory) => {
        transactionCategory.preload('loanTransaction');
      });

    const pending = await user
      .related('transactions').query()
      .whereHas('accountTransaction', (query) => {
        query.where('account_id', accountId)
          .andWhere('pending', true);
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories', (transactionCategory) => {
        transactionCategory.preload('loanTransaction');
      });

    result.transactions = transactions;
    result.pending = pending;

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async balances({ request }: HttpContextContract): Promise<BalanceHistory[]> {
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

  // eslint-disable-next-line class-methods-use-this
  public async addTransaction({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user not defined');
    }

    const validationSchema = schema.create({
      date: schema.date(),
      name: schema.string(),
      amount: schema.number(),
      comment: schema.string.optional(),
      splits: schema.array().members(
        schema.object().members({
          categoryId: schema.number(),
          amount: schema.number(),
          comment: schema.string.optional(),
        }),
      ),
    });

    const { acctId } = request.params();
    const requestData = await request.validate({
      schema: validationSchema,
    });

    const trx = await Database.transaction();

    const account = await Account.findOrFail(acctId, { client: trx });

    const transaction = (new Transaction()).useTransaction(trx);

    transaction.fill({
      type: TransactionType.MANUAL_TRANSACTION,
      date: requestData.date,
      sortOrder: 2147483647,
      comment: requestData.comment,
    });

    await transaction.related('user').associate(user);

    const acctTransaction = await account.related('accountTransactions').create({
      name: requestData.name,
      transactionId: transaction.id,
      amount: requestData.amount,
    });

    account.balance += acctTransaction.amount;

    await account.save();

    const categoryBalances: CategoryBalanceProps[] = [];

    const { splits } = requestData;

    if (!splits || splits.length === 0) {
      const unassignedCat = await user.getUnassignedCategory({ client: trx });

      unassignedCat.amount += acctTransaction.amount;

      await unassignedCat.save();

      categoryBalances.push({ id: unassignedCat.id, balance: unassignedCat.amount })
    }
    else {
      // eslint-disable-next-line no-restricted-syntax
      for (const split of splits) {
        const trxCategory = (new TransactionCategory()).useTransaction(trx);

        trxCategory.fill({
          transactionId: transaction.id,
          categoryId: split.categoryId,
          amount: split.amount,
          comment: split.comment,
        })

        // eslint-disable-next-line no-await-in-loop
        await trxCategory.save();

        // eslint-disable-next-line no-await-in-loop
        const category = await Category.findOrFail(split.categoryId, { client: trx });

        category.amount += split.amount;

        // eslint-disable-next-line no-await-in-loop
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
