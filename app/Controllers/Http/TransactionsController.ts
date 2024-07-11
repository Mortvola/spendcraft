// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';
import Transaction from 'App/Models/Transaction';
import Loan from 'App/Models/Loan';
import LoanTransaction from 'App/Models/LoanTransaction';
import AccountTransaction from 'App/Models/AccountTransaction';
import {
  AccountBalanceProps, ApiResponse, CategoryBalanceProps, RequestErrorCode,
  TransactionProps, TransactionsResponse, TransactionType,
  UpdateTransactionResponse,
} from 'Common/ResponseTypes';
import Account from 'App/Models/Account';
import { schema, rules } from '@ioc:Adonis/Core/Validator';
import TransactionLog from 'App/Models/TransactionLog';
import { ModelAttributes } from '@ioc:Adonis/Lucid/Orm';
import transactionFields, { getChanges } from './transactionFields';

export default class TransactionsController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
  }: HttpContextContract): Promise<Transaction | TransactionsResponse> {
    const { trxId } = request.params();

    if (trxId) {
      const transaction = await Transaction.query()
        .where('id', trxId)
        .andWhere('deleted', false)
        .firstOrFail();

      await transaction.load('accountTransaction');

      return transaction;
    }

    let { t } = request.qs();
    const { since } = request.qs();

    let query = Transaction.query()
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories')
      .andWhere('deleted', false);

    if (t) {
      if (!Array.isArray(t)) {
        t = [t];
      }

      query = query.whereIn('id', t)
    }

    if (since) {
      query = query.andWhere('date', '>=', since)
    }

    // console.log(query.toQuery());

    const transactions = await query;

    const response = {
      transactions: transactions.map((transaction) => (
        transaction.serialize(transactionFields) as TransactionProps
      )),
      balance: 0,
    };

    return response;
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    response,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<ApiResponse<UpdateTransactionResponse>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { trxId } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string.optional([rules.trim()]),
        amount: schema.number.optional(),
        principle: schema.number.optional(),
        date: schema.date.optional(),
        comment: schema.string.optional([rules.trim()]),
        version: schema.number(),
        splits: schema.array().members(
          schema.object().members({
            categoryId: schema.number(),
            amount: schema.number(),
            comment: schema.string.optional([rules.trim()]),
          }),
        ),
      }),
    });

    const trx = await Database.transaction();

    try {
      let changes = {};

      const budget = await user.related('budget').query()
        .useTransaction(trx)
        .forUpdate()
        .firstOrFail();

      const transaction = await Transaction.findOrFail(trxId, { client: trx });

      // Only perform the update if the versions maatch
      if (transaction.version !== requestData.version) {
        await trx.rollback();

        response.status(409);

        return {
          errors: [{
            code: RequestErrorCode.INCORRECT_VERSION,
            status: '409',
          }],
        }
      }

      const categoryResults: CategoryBalanceProps[] = [];

      const acctTrans = await AccountTransaction.findByOrFail('transactionId', trxId, { client: trx });
      const account = await Account.findOrFail(acctTrans.accountId);

      if (account.tracking === 'Transactions' && requestData.splits.length === 0) {
        throw new Error('no categories provided')
      }

      const changedCategories: Record<number, number> = {}

      if (account.tracking === 'Transactions') {
        const oldTransactionCategories = await transaction.related('transactionCategories').query()
          .preload('loanTransaction');

        if (oldTransactionCategories.length > 0) {
          // There are pre-existing category splits.
          // Credit the category balance for each one.
          // eslint-disable-next-line no-restricted-syntax
          for (const transactionCategory of oldTransactionCategories) {
            // eslint-disable-next-line no-await-in-loop
            const category = await transactionCategory.related('category').query().firstOrFail();
            category.balance -= transactionCategory.amount;

            changedCategories[category.id] = -transactionCategory.amount;

            // eslint-disable-next-line no-await-in-loop
            await category.save();

            categoryResults.push({
              id: category.id,
              balance: category.balance,
            });
          }

          // Delete any loan transactions that are associated with the categories being deleted.
          // eslint-disable-next-line no-restricted-syntax
          for (const transactionCategory of oldTransactionCategories) {
            if (transactionCategory.loanTransaction) {
              transactionCategory.loanTransaction.delete();
              // eslint-disable-next-line no-await-in-loop
              const loan = await Loan.findByOrFail('categoryId', transactionCategory.categoryId, { client: trx });
              // eslint-disable-next-line no-await-in-loop
              await loan.updateBalance();
            }

            transactionCategory.delete();
          }
        }

        const transactionCategories = requestData.splits;

        // eslint-disable-next-line no-restricted-syntax
        for (const transactionCategory of transactionCategories) {
          // eslint-disable-next-line no-await-in-loop
          const txCategory = await transaction.related('transactionCategories')
            .create({
              categoryId: transactionCategory.categoryId,
              amount: transactionCategory.amount,
              comment: transactionCategory.comment,
              transactionId: trxId,
            });

          // eslint-disable-next-line no-await-in-loop
          const category = await txCategory.related('category').query().firstOrFail();
          category.balance += transactionCategory.amount;

          changedCategories[category.id] = (changedCategories[category.id] ?? 0) + transactionCategory.amount;

          // eslint-disable-next-line no-await-in-loop
          await category.save();

          if (category.type === 'LOAN') {
            const loanTrx = (new LoanTransaction()).useTransaction(trx);

            // eslint-disable-next-line no-await-in-loop
            const loan = await Loan.findByOrFail('categoryId', transactionCategory.categoryId, { client: trx });

            loanTrx.fill({
              loanId: loan.id,
              principle: 0,
            });

            // eslint-disable-next-line no-await-in-loop
            await loanTrx.related('transactionCategory').associate(txCategory);
            // eslint-disable-next-line no-await-in-loop
            await loan.updateBalance();
          }

          // Determine if the category is already in the array.
          const index = categoryResults.findIndex((c) => c.id === category.id);

          // If the category is already in the array then simply update the amount.
          // Otherwise, add the category and amount to the array.
          if (index !== -1) {
            categoryResults[index].balance = category.balance;
          }
          else {
            categoryResults.push({
              id: category.id,
              balance: category.balance,
            });
          }
        }
      }

      if (requestData.name !== undefined
        || requestData.amount !== undefined
        || requestData.principle !== undefined
      ) {
        if (account.type === 'loan') {
          account.balance -= acctTrans.principle ?? 0;
        }
        else {
          account.balance -= acctTrans.amount;
        }

        const accountTransactionChanges: Partial<ModelAttributes<typeof acctTrans>> = {}

        accountTransactionChanges.name = requestData.name;
        accountTransactionChanges.amount = requestData.amount;
        accountTransactionChanges.principle = requestData.principle;

        changes = getChanges(acctTrans, accountTransactionChanges, changes);

        acctTrans.merge(accountTransactionChanges);

        await acctTrans.save();

        if (account.type === 'loan') {
          account.balance += acctTrans.principle ?? 0;
        }
        else {
          account.balance += acctTrans.amount;
        }

        await account.save();
      }

      const transactionChanges: Partial<ModelAttributes<typeof transaction>> = {}

      transactionChanges.date = requestData.date;
      transactionChanges.comment = requestData.comment;

      changes = getChanges(transaction, transactionChanges, changes);

      transactionChanges.version = transaction.version + 1;

      transaction.merge(transactionChanges);

      await transaction.save();

      // Create budget change for synchronizations
      await budget.related('budgetChange').create({
        change: {
          transactions: {
            modified: [transaction.id],
            deleted: [],
          },
          categories: {
            modified: Object.keys(changedCategories)
              .filter((key) => changedCategories[key] !== 0)
              .map((key) => parseInt(key, 10)),
            deleted: [],
          },
        },
      })

      // Log transaction change for users
      await transaction.related('transactionLog')
        .create({
          budgetId: transaction.budgetId,
          message: `${user.username} modified a transaction for "${acctTrans.name}".`,
          transactionId: transaction.id,
          changes,
        });

      // Prepare resposne
      await transaction.load('transactionCategories');

      await transaction.load('accountTransaction', (accountTrx) => {
        accountTrx.preload('account', (acct) => {
          acct.preload('institution');
        });
      });

      const result: UpdateTransactionResponse = {
        transaction: transaction.serialize(transactionFields) as TransactionProps,
        categories: categoryResults,
        acctBalances: [{
          id: account.id,
          balance: account.balance,
        }],
      }

      // Get the transaction count for each of the categories
      // eslint-disable-next-line no-restricted-syntax
      for (const cat of result.categories) {
        // eslint-disable-next-line no-await-in-loop
        const category = await Category.findOrFail(cat.id, { client: trx });

        // eslint-disable-next-line no-await-in-loop
        cat.count = await category.transactionsCount(budget);
      }

      await trx.commit();

      return {
        data: result,
      };
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async dedup({
    request,
  }: HttpContextContract): Promise<void> {
    const { trxId } = request.params();

    const transaction = await Transaction.query()
      .where('id', trxId)
      .andWhere('deleted', false)
      .firstOrFail();

    transaction.duplicateOfTransactionId = null;

    await transaction.save();
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<{ categories: CategoryBalanceProps[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await Database.transaction();

    try {
      const result: {
        categories: CategoryBalanceProps[],
        acctBalances: AccountBalanceProps[],
      } = { categories: [], acctBalances: [] };

      const { trxId } = request.params();

      const transaction = await Transaction.findOrFail(trxId, { client: trx });

      const acctTransaction = await AccountTransaction.findBy('transactionId', transaction.id, { client: trx });

      let account: Account | null = null;

      if (acctTransaction) {
        account = await Account.findOrFail(acctTransaction.accountId, { client: trx });
      }

      const trxCategories = await transaction.related('transactionCategories').query();

      if (trxCategories.length === 0) {
        if (account && account.tracking === 'Transactions') {
          if (!acctTransaction) {
            throw new Error('acctTransaction is null');
          }

          const unassignedCat = await budget.getUnassignedCategory({ client: trx });

          unassignedCat.balance -= acctTransaction.amount;

          result.categories.push({ id: unassignedCat.id, balance: unassignedCat.balance });

          await unassignedCat.save();
        }
      }
      else {
        // eslint-disable-next-line no-restricted-syntax
        for (const trxCat of trxCategories) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(trxCat.categoryId, { client: trx });

          category.balance -= trxCat.amount;

          const balance = result.categories.find((b) => b.id === category.id);

          if (balance) {
            balance.balance = category.balance;
          }
          else {
            result.categories.push({ id: category.id, balance: category.balance });
          }

          if (category.type === 'LOAN') {
            // eslint-disable-next-line no-await-in-loop
            const loanTransaction = await trxCat.related('loanTransaction').query().firstOrFail();

            // eslint-disable-next-line no-await-in-loop
            await loanTransaction.delete();

            // eslint-disable-next-line no-await-in-loop
            const loan = await loanTransaction.related('loan').query().firstOrFail();

            loan.updateBalance();
          }

          category.save();

          // eslint-disable-next-line no-await-in-loop
          await trxCat.delete();
        }
      }

      if (account) {
        if (!acctTransaction) {
          throw new Error('acctTransaction is null');
        }

        if (!acctTransaction.pending) {
          if (account.type === 'loan') {
            account.balance -= acctTransaction.principle ?? 0;
          }
          else {
            account.balance -= acctTransaction.amount;
          }

          account.save();

          result.acctBalances.push({ id: account.id, balance: account.balance });
        }
      }

      transaction.deleted = true;

      await transaction.save();

      await trx.commit();

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async getRebalances({
    auth: {
      user,
    },
  }: HttpContextContract): Promise<TransactionsResponse> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const rebalances = await budget.related('transactions').query()
      .preload('transactionCategories')
      .where('type', TransactionType.REBALANCE_TRANSACTION)
      .orderBy('date', 'desc');

    return {
      transactions: rebalances.map((r) => (
        r.serialize(transactionFields) as TransactionProps
      )),
      balance: 0,
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async search({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<TransactionsResponse> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const results = await budget.related('transactions').query()
      .where('deleted', false)
      .whereHas('accountTransaction', (q) => {
        q.whereILike('name', `%${request.qs().name.trim()}%`)
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories', (transactionCategory) => {
        transactionCategory.preload('loanTransaction');
      })
      .limit(request.qs().limit)
      .offset(request.qs().offset)
      .orderBy('date', 'desc')

    return ({
      transactions: results.map((t) => (
        t.serialize(transactionFields) as TransactionProps
      )),
      balance: 0,
    })
  }

  // eslint-disable-next-line class-methods-use-this
  public async logs({
    auth: {
      user,
    },
  }: HttpContextContract): Promise<TransactionLog[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const logs = await budget.related('transactionLog').query().orderBy('createdAt', 'desc');

    return logs;
  }
}
