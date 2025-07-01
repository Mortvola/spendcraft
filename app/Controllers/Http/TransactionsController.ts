import { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import Category from '#app/Models/Category';
import Transaction from '#app/Models/Transaction';
import AccountTransaction from '#app/Models/AccountTransaction';
import {
  AccountBalanceProps, ApiResponse, CategoryBalanceProps, CategoryType, RequestErrorCode,
  StatementProps,
  TransactionProps, TransactionsResponse, TransactionType,
  UpdateTransactionResponse,
} from '#common/ResponseTypes';
import Account from '#app/Models/Account';
import { schema, rules } from '@adonisjs/validator';
import TransactionLog from '#app/Models/TransactionLog';
import Statement from '#app/Models/Statement';
import transactionFields, { getChanges } from './transactionFields.js';
import { ModelObject } from "@adonisjs/lucid/types/model";

export default class TransactionsController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
  }: HttpContext): Promise<Transaction> {
    const { trxId } = request.params();

    const transaction = await Transaction.query()
      .where('id', trxId)
      .andWhere('deleted', false)
      .firstOrFail();

    await transaction.load('accountTransaction');

    return transaction;
  }

  // eslint-disable-next-line class-methods-use-this
  public async getMultiple({
    request,
  }: HttpContext): Promise<ApiResponse<TransactionsResponse>> {
    let { t } = request.qs();

    if (!Array.isArray(t)) {
      t = [t];
    }

    const transactions = await Transaction.query()
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .whereIn('id', t)
      .andWhere('deleted', false);

    return {
      data: {
        transactions: transactions.map((transaction) => (
          transaction.serialize(transactionFields) as TransactionProps
        )),
        balance: 0,
      },
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    response,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<ApiResponse<UpdateTransactionResponse>> {
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
        statementId: schema.number.nullableAndOptional(),
        categories: schema.array.optional().members(
          schema.object().members({
            categoryId: schema.number(),
            amount: schema.number(),
            comment: schema.string.optional([rules.trim()]),
          }),
        ),
      }),
    });

    const trx = await db.transaction();

    try {
      user.useTransaction(trx)

      let changes = {};

      const budget = await user.related('budget').query()
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
            detail: 'The version of the transaction does not match the version stored in the database.'
          }],
        }
      }

      const categoriesResult: CategoryBalanceProps[] = [];

      // Get the 'unassigned' category id
      const unassigned = await budget.getUnassignedCategory({ client: trx });

      const acctTrans = await transaction.related('accountTransaction').query().firstOrFail();
      // const acctTrans = await AccountTransaction.findByOrFail('transactionId', trxId, { client: trx });

      const account = await acctTrans.related('account').query().firstOrFail();
      // const account = await Account.findOrFail(acctTrans.accountId);

      const unassignedCat = await budget.getUnassignedCategory({ client: trx });

      if (requestData.categories !== undefined) {
        if (requestData.categories.length === 0) {
          requestData.categories = [{
            categoryId: unassignedCat.id,
            amount: requestData.amount ?? acctTrans.amount,
            comment: undefined,
          }]
        }
        const { categories } = transaction;

        if (categories.length > 0) {
          // There are pre-existing category splits.
          // Credit the category balance for each one.
          // eslint-disable-next-line no-restricted-syntax
          for (const transCategory of categories) {
            // eslint-disable-next-line no-await-in-loop
            const category = await Category.findOrFail(transCategory.categoryId, { client: trx });

            category.balance -= transCategory.amount;

            // eslint-disable-next-line no-await-in-loop
            await category.save();

            categoriesResult.push({
              id: category.id,
              balance: category.balance,
            });
          }

          // Delete any loan transactions that are associated with the categories being deleted.
          // eslint-disable-next-line no-restricted-syntax
          // for (const split of splits) {
          //   if (split.loanTransaction) {
          //     split.loanTransaction.delete();
          //     // eslint-disable-next-line no-await-in-loop
          //     const loan = await Loan.findByOrFail('categoryId', split.categoryId, { client: trx });
          //     // eslint-disable-next-line no-await-in-loop
          //     await loan.updateBalance();
          //   }

          //   split.delete();
          // }
        }
        else if (account.tracking === 'Transactions') {
          // There are no category splits. Debit the 'Unassigned' category
          if (requestData.amount !== undefined) {
            unassigned.balance -= acctTrans.amount;
            await unassigned.save();
          }

          categoriesResult.push({
            id: unassigned.id,
            balance: unassigned.balance,
          });
        }

        if (requestData.categories.length > 0) {
          transaction.categories = requestData.categories;

          // eslint-disable-next-line no-restricted-syntax
          for (const transCategory of requestData.categories) {
            // eslint-disable-next-line no-await-in-loop
            const category = await Category.findOrFail(transCategory.categoryId, { client: trx });

            category.balance += transCategory.amount;

            // eslint-disable-next-line no-await-in-loop
            await category.save();

            if (category.type === CategoryType.Loan) {
              // const loanTrx = (new LoanTransaction()).useTransaction(trx);

              // // eslint-disable-next-line no-await-in-loop
              // const loan = await Loan.findByOrFail('categoryId', split.categoryId, { client: trx });

              // loanTrx.fill({
              //   loanId: loan.id,
              //   principle: 0,
              // });

              // // eslint-disable-next-line no-await-in-loop
              // await loanTrx.related('transactionCategory').associate(txCategory);
              // // eslint-disable-next-line no-await-in-loop
              // await loan.updateBalance();
            }

            // Determine if the category is already in the array.
            const index = categoriesResult.findIndex((c) => c.id === category.id);

            // If the category is already in the array then simply update the amount.
            // Otherwise, add the category and amount to the array.
            if (index !== -1) {
              categoriesResult[index].balance = category.balance;
            }
            else {
              categoriesResult.push({
                id: category.id,
                balance: category.balance,
              });
            }
          }
        }
        else if (account.tracking === 'Transactions') {
          // There are no category splits. Debit the 'Unassigned' category
          if (requestData.amount !== undefined) {
            unassigned.balance += requestData.amount;
            await unassigned.save();
          }

          const index = categoriesResult.findIndex((c) => c.id === unassigned.id);

          if (index !== -1) {
            categoriesResult[index].balance = unassigned.balance;
          }
          else {
            categoriesResult.push({
              id: unassigned.id,
              balance: unassigned.balance,
            });
          }
        }
      }

      let changedStatementId: number | null = null

      if (
        requestData.name !== undefined
        || requestData.amount !== undefined
        || requestData.principle !== undefined
        || requestData.statementId !== undefined
      ) {
        if (account.type === 'loan') {
          account.balance -= acctTrans.principle ?? 0;
        }
        else {
          account.balance -= acctTrans.amount;
        }

        const accountTransactionChanges: ModelObject = {
          name: requestData.name,
          amount: requestData.amount,
          principle: requestData.principle,
          statementId: requestData.statementId,
        }

        changes = getChanges(acctTrans.$attributes, accountTransactionChanges, changes);

        // eslint-disable-next-line no-restricted-syntax
        for (const property of Object.getOwnPropertyNames(accountTransactionChanges)) {
          if (accountTransactionChanges[property] === undefined) {
            delete accountTransactionChanges[property]
          }
        }

        // Note the change in statement id, if any, for retrieval of the statement
        // later.
        if (
          accountTransactionChanges.statementId !== undefined
          && accountTransactionChanges.statementId !== acctTrans.statementId
        ) {
          changedStatementId = accountTransactionChanges.statementId ?? acctTrans.statementId
        }

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

      const transactionChanges: ModelObject = {
        date: requestData.date,
        comment: requestData.comment,
        categories: requestData.categories,
      }

      changes = getChanges(transaction.$attributes, transactionChanges, changes);

      transactionChanges.version = transaction.version + 1;

      // eslint-disable-next-line no-restricted-syntax
      for (const property of Object.getOwnPropertyNames(transactionChanges)) {
        if (transactionChanges[property] === undefined) {
          delete transactionChanges[property]
        }
      }

      transaction.merge(transactionChanges);

      await transaction.save();

      await transaction.related('transactionLog')
        .create({
          budgetId: transaction.budgetId,
          message: `${user.username} modified a transaction for "${acctTrans.name}".`,
          changes,
        });

      await transaction.load('accountTransaction', (accountTrx) => {
        accountTrx.preload('account', (acct) => {
          acct.preload('institution');
        });
      });

      // Get the transaction count for each of the categories
      // eslint-disable-next-line no-restricted-syntax
      for (const cat of categoriesResult) {
        // eslint-disable-next-line no-await-in-loop
        const category = await Category.findOrFail(cat.id, { client: trx });

        // eslint-disable-next-line no-await-in-loop
        cat.count = await category.transactionsCount(budget);
      }

      await trx.commit();

      let statement: Statement | null | undefined

      // If the transaction was added or removed from a statement then
      // send the updated statement in the response.
      if (changedStatementId !== null) {
        statement = await account.related('statements').query()
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
          .where('id', changedStatementId)
          .first()
      }

      const result = {
        data: {
          transaction: transaction.serialize(transactionFields) as TransactionProps,
          categories: categoriesResult,
          acctBalances: [{
            id: account.id,
            balance: account.balance,
          }],
          statement: statement?.serialize() as StatementProps,
        },
      }

      return result;
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
  }: HttpContext): Promise<void> {
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
  }: HttpContext): Promise<ApiResponse<{ categories: CategoryBalanceProps[] }>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await db.transaction();

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

      const trxCategories = transaction.categories;

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

          if (category.type === CategoryType.Loan) {
            // // eslint-disable-next-line no-await-in-loop
            // const loanTransaction = await trxCat.related('loanTransaction').query().firstOrFail();

            // // eslint-disable-next-line no-await-in-loop
            // await loanTransaction.delete();

            // // eslint-disable-next-line no-await-in-loop
            // const loan = await loanTransaction.related('loan').query().firstOrFail();

            // loan.updateBalance();
          }

          category.save();

          // eslint-disable-next-line no-await-in-loop
          // await trxCat.delete();
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

      return {
        data: result,
      }
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
  }: HttpContext): Promise<ApiResponse<TransactionsResponse>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const rebalances = await budget.related('transactions').query()
      .where('type', TransactionType.REBALANCE_TRANSACTION)
      .where('deleted', false)
      .orderBy('date', 'desc');

    return {
      data: {
        transactions: rebalances.map((r) => (
          r.serialize(transactionFields) as TransactionProps
        )),
        balance: 0,
      },
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async search({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<ApiResponse<TransactionsResponse>> {
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
      .limit(request.qs().limit)
      .offset(request.qs().offset)
      .orderBy('date', 'desc')

    return {
      data: {
        transactions: results.map((t) => (
          t.serialize(transactionFields) as TransactionProps
        )),
        balance: 0,
      },
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async logs({
    auth: {
      user,
    },
  }: HttpContext): Promise<TransactionLog[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const logs = await budget.related('transactionLog').query().orderBy('createdAt', 'desc');

    return logs;
  }
}
