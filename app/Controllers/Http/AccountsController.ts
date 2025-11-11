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
} from '#common/ResponseTypes';
import Statement from '#app/Models/Statement';
import AccountTransaction from '#app/Models/AccountTransaction';
import transactionFields from './transactionFields.js';
import { addBalance, updateAccount, updateBalance } from '#app/validation/Validators/account';
import { DateTime } from 'luxon';
import { addTransaction } from '#validators/transaction';
import { addStatement, updateStatement } from '#validators/statement';

interface AddedTransaction {
  categories: CategoryBalanceProps[],
  transaction: Record<string, unknown>,
  acctBalances: AccountBalanceProps[],
};

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

  public async balances({ request }: HttpContext): Promise<BalanceHistory[] | { date: string, balance: number}[]> {
    const accountId = parseInt(request.params().acctId, 10);

    const account = await Account.findOrFail(accountId)

    let balances: BalanceHistory[] | { date: string, balance : number}[] = [];

    if (account.tracking === TrackingType.Transactions) {
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

      const account = await Account.findOrFail(acctId, { client: trx });

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

      for (const split of categories) {
        const category = await Category.findOrFail(split.categoryId, { client: trx });

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

    const requestData = await request.validateUsing(addBalance)

    const trx = await db.transaction();

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

    const { id } = request.params();

    const trx = await db.transaction();

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

    const requestData = await request.validateUsing(updateAccount);

    const trx = await db.transaction();

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

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);

      const budget = await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const account = await Account.findOrFail(acctId, { client: trx });

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

      response.send({
        errors: [{
          message: error.message,
        }],
      })
    }
  }

  public async getStatements({
    request,
    auth: {
      user,
    },
  }: HttpContext) {
    if (!user) {
      throw new Error('user not defined');
    }

    const { acctId } = request.params();

    const account = await Account.findOrFail(acctId)

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

      const account = await Account.findOrFail(acctId, { client: trx });

      const statement = await account.related('statements').create({
        startDate: requestData.startDate,
        endDate: requestData.endDate,
        startingBalance: requestData.startingBalance,
        endingBalance: requestData.endingBalance,
      });

      const startDate = requestData.startDate.toISODate()
      const endDate = requestData.endDate.toISODate()

      if (startDate === null || endDate === null) {
        throw new Error('start date or end date is null')
      }

      const acctTransactions = await account.related('accountTransactions').query()
        .whereHas('transaction', (query) => {
          query.whereBetween('date', [startDate, endDate])
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

      const statement = await Statement.findOrFail(statementId, { client: trx })

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

          await Promise.all(transactions.map((transaction) => {
            transaction.statementId = null

            return transaction.save()
          }))
        }
      }

      const changes: Record<string, unknown> = {
        startDate: requestData.startDate,
        endDate: requestData.endDate,
        startingBalance: requestData.startingBalance,
        endingBalance: requestData.endingBalance,
      }

      for (const property of Object.getOwnPropertyNames(changes)) {
        if (changes[property] === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete changes[property]
        }
      }
      
      if (Object.getOwnPropertyNames(changes).length > 0) {
        statement.merge(changes)

        await statement.save();
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
