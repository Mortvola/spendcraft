import { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import { Exception } from '@adonisjs/core/exceptions';
import Account from '#app/Models/Account';
import BalanceHistory from '#app/Models/BalanceHistory';
import Category from '#app/Models/Category';
import Transaction from '#app/Models/Transaction';
import {
  TransactionsResponse, CategoryBalanceProps, TransactionProps, TransactionType, AccountBalanceProps, TrackingType,
  ApiResponse,
  AddStatementResponse,
  StatementProps,
  AddBalanceResponse,
  AccountType,
} from '#common/ResponseTypes';
import Statement from '#app/Models/Statement';
import AccountTransaction from '#app/Models/AccountTransaction';
import transactionFields from './transactionFields.js';
import { addBalance, updateAccount, updateBalance } from '#app/validation/Validators/account';
import { DateTime } from 'luxon';
import { addTransaction } from '#validators/transaction';
import { validateTransactionSplits } from '#app/validation/transactionSplits';
import { addStatement, updateStatement } from '#validators/statement';
import type { ModelAdapterOptions } from '@adonisjs/lucid/types/model';

interface AddedTransaction {
  categories: CategoryBalanceProps[],
  transaction: Record<string, unknown>,
  acctBalances: AccountBalanceProps[],
};

function budgetAccounts(budgetId: number, options?: ModelAdapterOptions) {
  return Account.query(options)
    .whereHas('institution', (query) => query.where('budgetId', budgetId));
}

function budgetHistory(budgetId: number, options?: ModelAdapterOptions) {
  return BalanceHistory.query(options)
    .whereIn('accountId', budgetAccounts(budgetId, options).select('id'));
}

function budgetStatements(budgetId: number, options?: ModelAdapterOptions) {
  return Statement.query(options)
    .whereHas('account', (query) => {
      query.whereHas('institution', (institution) => institution.where('budgetId', budgetId));
    });
}

export default class AccountsController {
  public async transactions({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<ApiResponse<TransactionsResponse>> {
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
    const acct = await budgetAccounts(user.budgetId).where('id', accountId).firstOrFail();

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

  public async balances({ request, auth: { user } }: HttpContext): Promise<BalanceHistory[] | { date: string, balance: number}[]> {
    if (!user) {
      throw new Error('user not defined');
    }

    const accountId = parseInt(request.params().acctId, 10);

    const account = await budgetAccounts(user.budgetId).where('id', accountId).firstOrFail()

    let balances: BalanceHistory[] | { date: string, balance : number}[] = [];

    if (account.tracking === TrackingType.Balances) {
      balances = await BalanceHistory.query()
        .where('accountId', accountId)
        .orderBy('date', 'desc');
    }
    else {
      // Currently hard coded number of days to display.
      // TODO: send this as a query parameter.
      const daysToDisplay = 90

      // Find the most recent transaction so we know where the window starts.
      const mostRecentTransaction = await Transaction.query()
        .whereHas('accountTransaction', (query) => {
          query
            .where('account_id', account.id)
        })
        .orderBy('date', 'desc')
        .first()

      const date = mostRecentTransaction?.date ?? DateTime.now()

      const startDate = date.minus({ days: daysToDisplay })

      const query = `
        select
          to_char(date, 'YYYY-MM-DD') as date,
          balance - COALESCE(sum(trans_sum) over (partition by id order by id, date desc rows between unbounded preceding and 1 preceding), 0) as balance
        from (
          select a.id, a.name, cast(date_trunc('day', date) as date) as date, sum(at.amount) as trans_sum, a.balance
          from account_transactions at
          join transactions t on t.id = at.transaction_id
          join accounts a on a.id = at.account_id
          where
            a.id = ${account.id}
            and t.date >= '${startDate.toISODate()}'
            and t.type in (0, 1, 5)
            and at.pending = false
            and t.deleted = false
          group by t.type, cast(date_trunc('day', date) as date), a.id
        ) as daily
        order by date desc
      `

      const results = await db.rawQuery(query) as { rows: { date: string, balance: string}[] }

      balances = results.rows.map((result) => ({
        date: result.date,
        balance: parseFloat(result.balance),
      }))
    }

    return balances;
  }

  public async addTransaction({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<AddedTransaction | undefined> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { acctId } = request.params();
    const requestData = await request.validateUsing(addTransaction);

    const trx = await db.transaction();

    try {
      const unassignedCat = await budget.getUnassignedCategory({ client: trx });

      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', acctId).firstOrFail();

      const transaction = (new Transaction()).useTransaction(trx);

      let { categories } = requestData

      // Use the unassigned category if the categories array is empty.
      if (account.tracking === TrackingType.Transactions && categories.length === 0) {
        categories = [{
          categoryId: unassignedCat.id,
          amount: requestData.amount,
          comment: undefined,
        }]
      }

      for (const categoryId of new Set(categories.map((split) => split.categoryId))) {
        await Category.query({ client: trx })
          .where('id', categoryId)
          .whereHas('group', (query) => query.where('budgetId', budget.id))
          .firstOrFail();
      }

      if (account.tracking === TrackingType.Transactions && account.type !== AccountType.Loan) {
        validateTransactionSplits(requestData.amount, categories);
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

      if (account.type === AccountType.Loan) {
        account.balance += acctTransaction.principle ?? 0;
      }
      else {
        account.balance += acctTransaction.amount;
      }

      await account.save();

      const categoryBalances: CategoryBalanceProps[] = [];

      for (const split of categories) {
        const category = await Category.query({ client: trx })
          .where('id', split.categoryId)
          .whereHas('group', (query) => query.where('budgetId', budget.id))
          .firstOrFail();

        category.balance += split.amount;

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

  public async addBalance({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<ApiResponse<AddBalanceResponse>> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();

    const trx = await db.transaction();

    try {
      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', acctId).firstOrFail();
      const requestData = await request.validateUsing(addBalance)

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
        .orderBy('id', 'asc')
        .firstOrFail();

      if (balance.id === latestBalance.id) {
        // We just added a new latest balance. Update the account
        // record with the new balance.
        account.balance = latestBalance.balance;

        await account.save();
      }

      await trx.commit();

      const date = balance.date.toISODate()

      if (!date) {
        throw new Error('date is null')
      }

      return {
        data: {
          id: balance.id,
          balance: balance.balance,
          date,
          accountBalance: account.balance,
        }
      }
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  public async updateBalance({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<ApiResponse<BalanceHistory>> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId, id } = request.params();

    await budgetHistory(user.budgetId).where('id', id).andWhere('accountId', acctId).firstOrFail();

    const requestData = await request.validateUsing(
      updateBalance,
      {
        meta: {
          acctId,
          id,
        }
      }
    );

    const trx = await db.transaction();

    try {
      const balance = await budgetHistory(user.budgetId, { client: trx })
        .where('id', id).andWhere('accountId', acctId).firstOrFail();

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

      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', balance.accountId).firstOrFail();
      account.balance = latestBalance.balance;
      await account.save();

      await trx.commit();

      return {
        data: balance,
      }
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  public async deleteBalance({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId, id } = request.params();

    const trx = await db.transaction();

    try {
      const historyQuery = budgetHistory(user.budgetId, { client: trx }).where('id', id);
      if (acctId !== undefined) {
        historyQuery.andWhere('accountId', acctId);
      }
      const balance = await historyQuery.firstOrFail();

      await balance.delete();

      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', balance.accountId).firstOrFail();
      const latestBalance = await BalanceHistory.query({ client: trx })
        .where('accountId', balance.accountId)
        .orderBy('date', 'desc')
        .first();
      account.balance = latestBalance?.balance ?? 0;
      await account.save();

      await trx.commit();
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  public async update({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    await budgetAccounts(user.budgetId).where('id', request.params().acctId).firstOrFail();

    const requestData = await request.validateUsing(updateAccount);

    const trx = await db.transaction();

    try {
      budget.useTransaction(trx);
      user.useTransaction(trx);
      await user.related('budget').query().forUpdate().firstOrFail();
      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', request.params().acctId).firstOrFail();

      if (requestData.name !== undefined) {
        account.name = requestData.name;
      }

      if (requestData.closed !== undefined) {
        account.closed = requestData.closed;
      }

      if (requestData.startDate !== undefined) {
        const previousDate = account.startDate.toISODate();
        const nextDate = requestData.startDate.toISODate();
        if (!previousDate || !nextDate) throw new Error('Invalid account start date');

        if (account.tracking === TrackingType.Transactions && previousDate !== nextDate) {
          const later = nextDate > previousDate;
          const crossing = await account.related('accountTransactions').query()
            .where('pending', false)
            .whereHas('transaction', (query) => {
              query.where('deleted', false).whereNot('type', TransactionType.STARTING_BALANCE)
                .where('date', '>=', later ? previousDate : nextDate)
                .where('date', '<', later ? nextDate : previousDate);
            }).preload('transaction');
          const deltas = new Map<number, number>();
          const unassigned = await budget.getUnassignedCategory({ client: trx });
          for (const row of crossing) {
            const splits = row.transaction.categories.length > 0
              ? row.transaction.categories : [{ categoryId: unassigned.id, amount: row.amount }];
            for (const split of splits) {
              deltas.set(split.categoryId, (deltas.get(split.categoryId) ?? 0)
                + Math.round(split.amount * 100) * (later ? -1 : 1));
            }
          }
          for (const [categoryId, cents] of deltas) {
            const category = await Category.query({ client: trx }).where('id', categoryId)
              .whereHas('group', (query) => query.where('budgetId', budget.id)).firstOrFail();
            category.balance = (Math.round(category.balance * 100) + cents) / 100;
            await category.save();
          }
        }
        account.startDate = requestData.startDate;
        if (account.tracking === TrackingType.Transactions) {
          const fundingPool = await budget.getFundingPoolCategory({ client: trx });
          await account.updateStartingBalance(budget, fundingPool);
          await fundingPool.save();
        }
      }

      if (requestData.tracking !== undefined) {
        account.tracking = requestData.tracking as TrackingType;
      }

      if (requestData.type !== undefined) {
        account.type = requestData.type as AccountType;
      }

      if (requestData.subtype !== undefined) {
        account.subtype = requestData.subtype
      }

      await account.save();

      await trx.commit();

    }
    catch (error) {
      logger.error(error)
      await trx.rollback();
      throw error;
    }
  }

  public async uploadOfx({
    request,
    response,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();

    await budgetAccounts(user.budgetId).where('id', acctId).firstOrFail();

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);

      const budget = await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', acctId).firstOrFail();

      const body = request.raw();

      if (!body) {
        throw new Exception('missing ofx data', { status: 400 });
      }

      await account.processOfx(body, budget, user);

      await trx.commit();
    }
    catch (error) {
      logger.error(error);
      await trx.rollback();

      response.status(500);

      if (error instanceof Error) {
        response.send({
          errors: [{
            message: error.message,
          }],
        })
      }
    }
  }

  public async getStatements({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<Statement[]> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();

    const account = await budgetAccounts(user.budgetId).where('id', acctId).firstOrFail()

    const statements = await account.related('statements').query()
      .withAggregate('accountTransactions', (query) => {
        query
          .where('amount', '>', 0).sum('amount').as('credits')
          .whereHas('transaction', (query2) => {
            query2.where('deleted', false)
          })
      })
      .withAggregate('accountTransactions', (query) => {
        query
          .where('amount', '<', 0).sum('amount').as('debits')
          .whereHas('transaction', (query2) => {
            query2.where('deleted', false)
          })
      })

    return statements
  }

  public async addStatement({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<AddStatementResponse | undefined> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();
    const requestData = await request.validateUsing(addStatement);

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);

      await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', acctId).firstOrFail();

      const statement = await account.related('statements').create({
        startDate: requestData.startDate,
        endDate: requestData.endDate,
        startingBalance: requestData.startingBalance,
        endingBalance: requestData.endingBalance,
        data: requestData.data ? {
          shortTermCapitalGains: requestData.data.shortTermCapitalGains,
          longTermCapitalGains: requestData.data.longTermCapitalGains,
          dividends: requestData.data.dividends,
          taxableInterest: requestData.data.taxableInterest,
        } : null
      });

      // Recompute from the resulting statement order in the mutation transaction.
      if (account.tracking === TrackingType.Balances) {
        const latestStatement = await Statement.query({ client: trx })
          .where('accountId', statement.accountId)
          .orderBy('endDate', 'desc')
          .firstOrFail()

        account.balance = latestStatement.endingBalance;

        await account.save()
      }

      const startDate = requestData.startDate.toISODate()
      const endDate = requestData.endDate.toISODate()

      if (startDate === null || endDate === null) {
        throw new Error('start date or end date is null')
      }

      const acctTransactions = await account.related('accountTransactions').query()
        .whereHas('transaction', (query) => {
          query.where('deleted', false).whereBetween('date', [startDate, endDate])
        })
        .whereNull('statementId')

      let debits = 0;
      let credits = 0;

      for (const acctTransaction of acctTransactions) {
        await acctTransaction.merge({
          statementId: statement.id,
        })
          .save()

        if (acctTransaction.amount < 0) {
          debits += acctTransaction.amount
        } else {
          credits += acctTransaction.amount
        }
      }

      await trx.commit()

      return {
        id: statement.id,
        startDate,
        endDate,
        startingBalance: statement.startingBalance,
        endingBalance: statement.endingBalance,
        credits,
        debits,
        data: {
          shortTermCapitalGains: statement.data?.shortTermCapitalGains ?? 0,
          longTermCapitalGains: statement.data?.longTermCapitalGains ?? 0,
          dividends: statement.data?.dividends ?? 0,
          taxableInterest: statement.data?.taxableInterest ?? 0,
        },
        transactions: acctTransactions.map((acctTransaction) => acctTransaction.transactionId)
      };
    }
    catch (error) {
      logger.error(error)
      await trx.rollback()
      throw error
    }
  }

  public async updateStatement({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<StatementProps | undefined> {
    if (!user) {
      throw new Error('user not defined');
    }

    const { statementId } = request.params();
    const requestData = await request.validateUsing(updateStatement)

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);

      await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const statement = await budgetStatements(user.budgetId, { client: trx }).where('id', statementId).firstOrFail()

      if (requestData.startDate !== undefined) statement.startDate = requestData.startDate
      if (requestData.endDate !== undefined) statement.endDate = requestData.endDate

      if (requestData.reconcile !== undefined) {
        if (requestData.reconcile === 'All') {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const startDate = statement.startDate.toISODate()!
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const endDate = statement.endDate.toISODate()!

          const transactions = await AccountTransaction.query({ client: trx })
            .where('accountId', statement.accountId)
            .whereNull('statementId')
            .where('pending', false)
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
            .andWhere('accountId', statement.accountId)

          await Promise.all(transactions.map((transaction) => {
            transaction.statementId = null

            return transaction.save()
          }))
        }
      }

      if (requestData.startingBalance !== undefined) statement.startingBalance = requestData.startingBalance
      if (requestData.endingBalance !== undefined) statement.endingBalance = requestData.endingBalance
      if (requestData.data !== undefined) statement.data = requestData.data

      await statement.save()

      // Recompute from the resulting statement order in the mutation transaction.
      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', statement.accountId).firstOrFail()

      if (account.tracking === TrackingType.Balances) {
        const latestStatement = await Statement.query({ client: trx })
          .where('accountId', statement.accountId)
          .orderBy('endDate', 'desc')
          .firstOrFail()

        account.balance = latestStatement.endingBalance;

        await account.save()
      }

      const credits = await AccountTransaction.query({ client: trx })
        .sum('amount')
        .where('statementId', statement.id)
        .andWhere('accountId', statement.accountId)
        .where('amount', '>', 0)
        .whereHas('transaction', (query2) => {
          query2.where('deleted', false)
        })

      const debits = await AccountTransaction.query({ client: trx })
        .sum('amount')
        .where('statementId', statement.id)
        .andWhere('accountId', statement.accountId)
        .where('amount', '<', 0)
        .whereHas('transaction', (query2) => {
          query2.where('deleted', false)
        })

      const startDate = statement.startDate.toISODate()
      const endDate = statement.endDate.toISODate()
      if (startDate === null || endDate === null) {
        throw new Error('start date or end date is null')
      }

      const response: StatementProps = {
        id: statement.id,
        startDate,
        endDate,
        startingBalance: statement.startingBalance,
        endingBalance: statement.endingBalance,
        credits: parseFloat(credits[0].$extras.sum ?? 0),
        debits: parseFloat(debits[0].$extras.sum ?? 0),
        data: {
          shortTermCapitalGains: statement.data?.shortTermCapitalGains ?? 0,
          longTermCapitalGains: statement.data?.longTermCapitalGains ?? 0,
          dividends: statement.data?.dividends ?? 0,
          taxableInterest: statement.data?.taxableInterest ?? 0,
        }
      };

      await trx.commit()
      return response
    }
    catch (error) {
      logger.error(error)
      await trx.rollback()
      throw error
    }
  }

  public async deleteStatement({
    request,
    auth: {
      user,
    },
  }: HttpContext) {
    if (!user) {
      throw new Error('user not defined');
    }

    const { statementId } = request.params();

    await db.transaction(async (trx) => {
      user.useTransaction(trx)
      await user.related('budget').query().forUpdate().firstOrFail()
      const statement = await budgetStatements(user.budgetId, { client: trx }).where('id', statementId).firstOrFail()
      const account = await budgetAccounts(user.budgetId, { client: trx }).where('id', statement.accountId).firstOrFail()

      await AccountTransaction.query({ client: trx }).where('statementId', statement.id).update({ statementId: null })
      await statement.delete()

      if (account.tracking === TrackingType.Balances) {
        const latest = await Statement.query({ client: trx }).where('accountId', account.id)
          .orderBy('endDate', 'desc').first()
        account.balance = latest?.endingBalance ?? 0
        await account.save()
      }
    })
  }
}
