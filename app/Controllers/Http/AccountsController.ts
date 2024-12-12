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
  AddStatementResponse,
  StatementProps,
} from 'Common/ResponseTypes';
import Statement from 'App/Models/Statement';
import AccountTransaction from 'App/Models/AccountTransaction';
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
      const unassignedCat = await budget.getUnassignedCategory({ client: trx });

      const account = await Account.findOrFail(acctId, { client: trx });

      const transaction = (new Transaction()).useTransaction(trx);

      let { categories } = requestData

      // Use the unassigned category if the categories array is empty.
      if (account.tracking === 'Transactions' && categories.length === 0) {
        categories = [{
          categoryId: unassignedCat.id,
          amount: requestData.amount,
          comment: undefined,
        }]
      }

      transaction.fill({
        version: 0,
        type: TransactionType.MANUAL_TRANSACTION,
        date: requestData.date,
        sortOrder: 2147483647,
        comment: requestData.comment,
        categories,
        duplicateOfTransactionId: null,
      });

      await transaction.related('budget').associate(budget);

      const acctTransaction = await account.related('accountTransactions').create({
        name: requestData.name,
        transactionId: transaction.id,
        amount: requestData.amount,
        principle: requestData.principle,
        statementId: null,
      });

      if (account.type === 'loan') {
        account.balance += acctTransaction.principle ?? 0;
      }
      else {
        account.balance += acctTransaction.amount;
      }

      await account.save();

      const categoryBalances: CategoryBalanceProps[] = [];

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

  // eslint-disable-next-line class-methods-use-this
  public async getStatements({
    request,
    auth: {
      user,
    },
  }: HttpContextContract) {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();

    const account = await Account.findOrFail(acctId)

    const statements = await account.related('statements').query()
      .withAggregate('accountTransactions', (query) => {
        query.where('amount', '>', 0).sum('amount').as('credits')
          .whereHas('transaction', (query2) => {
            query2.where('deleted', false)
          })
      })
      .withAggregate('accountTransactions', (query) => {
        query.where('amount', '<', 0).sum('amount').as('debits')
          .whereHas('transaction', (query2) => {
            query2.where('deleted', false)
          })
      })

    return statements
  }

  // eslint-disable-next-line class-methods-use-this
  public async addStatement({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<AddStatementResponse | void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        startDate: schema.date(),
        endDate: schema.date(),
        startingBalance: schema.number(),
        endingBalance: schema.number(),
      }),
    });

    const trx = await Database.transaction();

    try {
      await user.related('budget').query()
        .useTransaction(trx)
        .forUpdate()
        .firstOrFail();

      const account = await Account.findOrFail(acctId, { client: trx });

      const statement = await account.related('statements').create({
        startDate: requestData.startDate,
        endDate: requestData.endDate,
        startingBalance: requestData.startingBalance,
        endingBalance: requestData.endingBalance,
      });

      await trx.commit()

      return {
        id: statement.id,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        startDate: statement.startDate.toISODate()!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        endDate: statement.endDate.toISODate()!,
        startingBalance: statement.startingBalance,
        endingBalance: statement.endingBalance,
        credits: 0,
        debits: 0,
      };
    }
    catch (error) {
      logger.error(error)
      await trx.rollback()
      throw error
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateStatement({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<StatementProps | void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { statementId } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        reconcile: schema.string.optional(),
      }),
    })

    const trx = await Database.transaction();

    try {
      await user.related('budget').query()
        .useTransaction(trx)
        .forUpdate()
        .firstOrFail();

      const statement = await Statement.findOrFail(statementId, { client: trx })

      if (requestData.reconcile !== undefined) {
        if (requestData.reconcile === 'All') {
          const startDate = statement.startDate.toISODate()!
          const endDate = statement.endDate.toISODate()!

          const transactions = await AccountTransaction.query({ client: trx })
            .where('accountId', statement.accountId)
            .whereNull('statementId')
            .whereHas('transaction', (query) => {
              query
                .where('deleted', false)
                .whereBetween('date', [startDate, endDate])
                .where('type', '!=', TransactionType.STARTING_BALANCE)
            })

          await Promise.all(transactions.map((transaction) => {
            transaction.statementId = statement.id

            return transaction.save()
          }))
        }
        else if (requestData.reconcile === 'None') {
          const transactions = await AccountTransaction.query({ client: trx })
            .where('statementId', statement.id)

          await Promise.all(transactions.map((transaction) => {
            transaction.statementId = null

            return transaction.save()
          }))
        }
      }

      const credits = await AccountTransaction.query({ client: trx })
        .sum('amount')
        .where('statementId', statement.id)
        .where('amount', '>', 0)
        .whereHas('transaction', (query2) => {
          query2.where('deleted', false)
        })

      const debits = await AccountTransaction.query({ client: trx })
        .sum('amount')
        .where('statementId', statement.id)
        .where('amount', '<', 0)
        .whereHas('transaction', (query2) => {
          query2.where('deleted', false)
        })

      await trx.commit()

      return {
        id: statement.id,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        startDate: statement.startDate.toISODate()!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        endDate: statement.endDate.toISODate()!,
        startingBalance: statement.startingBalance,
        endingBalance: statement.endingBalance,
        credits: parseFloat(credits[0].$extras.sum ?? 0),
        debits: parseFloat(debits[0].$extras.sum ?? 0),
      };
    }
    catch (error) {
      logger.error(error)
      await trx.rollback()
      throw error
    }
  }
}
