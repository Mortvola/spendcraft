import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { rules, schema } from '@ioc:Adonis/Core/Validator';
import Database from '@ioc:Adonis/Lucid/Database';
import { Exception } from '@poppinss/utils';
import Account from 'App/Models/Account';
import BalanceHistory from 'App/Models/BalanceHistory';
import Category from 'App/Models/Category';
import Transaction from 'App/Models/Transaction';
import {
  TransactionsResponse, CategoryBalanceProps, TransactionProps, TransactionType, AccountBalanceProps, TrackingType,
  ApiResponse,
} from 'Common/ResponseTypes';
import transactionFields from './transactionFields';

type AddedTransaction = {
  categories: CategoryBalanceProps[],
  transaction: Record<string, unknown>,
  acctBalances: AccountBalanceProps[],
};

export default class AccountsController {
  // eslint-disable-next-line class-methods-use-this
  public async transactions({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<ApiResponse<TransactionsResponse>> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const accountId = parseInt(request.params().acctId, 10);

    const result: TransactionsResponse = {
      transactions: [],
      balance: 0,
    };

    // Determine if the account belongs to the authenticated user
    // and get the balance
    const acct = await Account.findOrFail(accountId);

    result.balance = acct.balance;

    const transactions = await budget
      .related('transactions').query()
      .whereHas('accountTransaction', (query) => {
        query.where('account_id', accountId)
          .andWhere('pending', request.qs().pending ?? false);
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .where('deleted', false)
      .andWhere('type', '!=', TransactionType.STARTING_BALANCE)
      .orderBy('transactions.date', 'desc')
      .orderByRaw('CASE WHEN transactions.type = 4 THEN 0 ELSE 1 END DESC')
      .orderByRaw('COALESCE(transactions.duplicate_of_transaction_id, transactions.id) desc')
      .orderBy('transactions.id', 'desc')
      .limit(request.qs().limit)
      .offset(request.qs().offset);

    result.transactions = transactions.map((t) => t.serialize(transactionFields) as TransactionProps);

    return {
      data: result,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async balances({ request }: HttpContextContract): Promise<BalanceHistory[]> {
    const accountId = parseInt(request.params().acctId, 10);

    const balances = await BalanceHistory.query()
      .where('accountId', accountId)
      .orderBy('date', 'desc');

    return balances;
  }

  // eslint-disable-next-line class-methods-use-this
  public async addTransaction({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<AddedTransaction | void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { acctId } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        date: schema.date(),
        name: schema.string(),
        amount: schema.number(),
        principle: schema.number.optional(),
        comment: schema.string.optional(),
        categories: schema.array().members(
          schema.object().members({
            categoryId: schema.number(),
            amount: schema.number(),
            comment: schema.string.optional(),
          }),
        ),
      }),
    });

    const trx = await Database.transaction();

    try {
      const account = await Account.findOrFail(acctId, { client: trx });

      const transaction = (new Transaction()).useTransaction(trx);

      transaction.fill({
        type: TransactionType.MANUAL_TRANSACTION,
        date: requestData.date,
        sortOrder: 2147483647,
        comment: requestData.comment,
        categories: requestData.categories,
      });

      await transaction.related('budget').associate(budget);

      const acctTransaction = await account.related('accountTransactions').create({
        name: requestData.name,
        transactionId: transaction.id,
        amount: requestData.amount,
        principle: requestData.principle,
      });

      if (account.type === 'loan') {
        account.balance += acctTransaction.principle ?? 0;
      }
      else {
        account.balance += acctTransaction.amount;
      }

      await account.save();

      const categoryBalances: CategoryBalanceProps[] = [];

      const { categories } = requestData;

      if (!categories || categories.length === 0) {
        // We only want to update the unassigned category balance if 
        // this account is tracking categorized transactions
        if (account.tracking === 'Transactions') {
          const unassignedCat = await budget.getUnassignedCategory({ client: trx });

          unassignedCat.balance += acctTransaction.amount;

          await unassignedCat.save();

          categoryBalances.push({ id: unassignedCat.id, balance: unassignedCat.balance })
        }
      }
      else {
        if (account.tracking !== 'Transactions') {
          throw new Error('categorized transaction within an uncategorized account');
        }

        // eslint-disable-next-line no-restricted-syntax
        for (const split of categories) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(split.categoryId, { client: trx });

          category.balance += split.amount;

          // eslint-disable-next-line no-await-in-loop
          await category.save();

          const balance = categoryBalances.find((b) => b.id === category.id);

          if (balance) {
            balance.balance = category.balance;
          }
          else {
            categoryBalances.push({ id: split.categoryId, balance: category.balance });
          }
        }
      }

      await transaction.load('accountTransaction', (acctTrx) => {
        acctTrx.preload('account', (acct) => {
          acct.preload('institution')
        })
      });

      await trx.commit();

      const result: AddedTransaction = {
        categories: categoryBalances,
        transaction: transaction.serialize(transactionFields),
        acctBalances: [{ id: account.id, balance: account.balance }],
      };

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async addBalance({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<BalanceHistory> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();

    const requestData = await request.validate({
      schema: schema.create({
        date: schema.date({}, [
          rules.unique({ table: 'balance_histories', column: 'date', where: { account_id: acctId } }),
        ]),
        amount: schema.number(),
      }),
      messages: {
        'date.unique': 'Only one balance per date is allowed.',
      },
    });

    const trx = await Database.transaction();

    try {
      const account = await Account.findOrFail(acctId, { client: trx });

      const balance = (new BalanceHistory())
        .useTransaction(trx)
        .fill({
          accountId: parseInt(acctId, 10),
          balance: requestData.amount,
          date: requestData.date,
        });

      await balance.save();

      const latestBalance = await BalanceHistory.query({ client: trx })
        .where('accountId', account.id)
        .orderBy('date', 'desc')
        .firstOrFail();

      if (balance.id === latestBalance.id) {
        // We just added a new latest balance. Update the account
        // record with the new balance.
        account.balance = latestBalance.balance;

        await account.save();
      }

      await trx.commit();

      return balance;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateBalance({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<BalanceHistory> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId, id } = request.params();

    const requestData = await request.validate({
      schema: schema.create({
        date: schema.date({}, [
          rules.unique({
            table: 'balance_histories', column: 'date', where: { account_id: acctId }, whereNot: { id },
          }),
        ]),
        amount: schema.number(),
      }),
      messages: {
        'date.unique': 'Only one balance per date is allowed.',
      },
    });

    const trx = await Database.transaction();

    try {
      const balance = await BalanceHistory.findOrFail(id, { client: trx });

      balance
        .merge({
          balance: requestData.amount,
          date: requestData.date,
        });

      await balance.save();

      const latestBalance = await BalanceHistory.query({ client: trx })
        .where('accountId', balance.accountId)
        .orderBy('date', 'desc')
        .firstOrFail();

      if (balance.id === latestBalance.id) {
        // We just updated the latest balance. Update the account
        // record with the new balance;
        const account = await Account.findOrFail(balance.accountId, { client: trx });

        account.balance = latestBalance.balance;

        await account.save();
      }

      await trx.commit();

      return balance;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteBalance({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { id } = request.params();

    const trx = await Database.transaction();

    try {
      const balance = await BalanceHistory.findOrFail(id);

      let latestBalance: BalanceHistory | null = await BalanceHistory.query({ client: trx })
        .where('accountId', balance.accountId)
        .orderBy('date', 'desc')
        .firstOrFail();

      await balance.delete();

      if (balance.id === latestBalance.id) {
        // We just deleted the latest balance record.
        // Find the next latest, if any, and use that to update
        // the account balance;
        const account = await Account.findOrFail(balance.accountId, { client: trx });

        latestBalance = await BalanceHistory.query({ client: trx })
          .where('accountId', balance.accountId)
          .orderBy('date', 'desc')
          .first();

        if (latestBalance) {
          account.balance = latestBalance.balance;
        }
        else {
          account.balance = 0;
        }

        await account.save();
      }

      await trx.commit();
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string.optional([rules.trim()]),
        closed: schema.boolean.optional(),
        startDate: schema.date.optional(),
        tracking: schema.string.optional(),
      }),
    });

    const trx = await Database.transaction();

    try {
      const account = await Account.findOrFail(request.params().acctId, { client: trx });

      if (requestData.name !== undefined) {
        account.name = requestData.name;
      }

      if (requestData.closed !== undefined) {
        account.closed = requestData.closed;
      }

      if (requestData.startDate !== undefined) {
        account.startDate = requestData.startDate;

        const fundingPool = await budget.getFundingPoolCategory({ client: trx });

        await account.updateStartingBalance(
          budget, fundingPool,
        );

        await fundingPool.save();
      }

      if (requestData.tracking !== undefined) {
        account.tracking = requestData.tracking as TrackingType;
      }

      await account.save();

      await trx.commit();

      await budget.syncCategoryBalances();
    }
    catch (error) {
      logger.error(error)
      await trx.rollback();
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async uploadOfx({
    request,
    response,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();

    const trx = await Database.transaction();

    try {
      const budget = await user.related('budget').query()
        .useTransaction(trx)
        .forUpdate()
        .firstOrFail();

      const account = await Account.findOrFail(acctId, { client: trx });

      const body = request.raw();

      if (!body) {
        throw new Exception('missing ofx data', 400);
      }

      await account.processOfx(body, budget, user);

      await trx.commit();
    }
    catch (error) {
      logger.error(error);
      await trx.rollback();

      response.status(500);

      response.send({
        errors: [{
          message: error.message,
        }],
      })
    }
  }
}
