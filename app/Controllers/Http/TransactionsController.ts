import { encodeMonetaryAmount, canonicalCategoryAllocations,
  categoryAllocationsToCents } from '#services/categoryAmountCodec';
import { prepareTaxReplacement } from '#services/transactionTaxStorage';
import { hasCategoryStorage } from '#services/categoryStorageBinding';
import { validateStoredCategoryConservation } from '#services/transactionCategoryStorage';
import {
  accountEligible, categoryEligible, categoryEffectDeltas,
} from '#services/transactionEligibility';
import { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents } from
  '#common/moneyCents';
import { HttpContext } from '@adonisjs/core/http';
import { Exception } from '@adonisjs/core/exceptions';
import db from '@adonisjs/lucid/services/db';
import Category from '#app/Models/Category';
import Transaction from '#app/Models/Transaction';
import AccountTransaction from '#app/Models/AccountTransaction';
import {
  AccountBalanceProps, AccountType, ApiResponse, CategoryBalanceProps,
    RequestErrorCode,
  StatementProps,
  TrackingType,
  TransactionProps, TransactionsResponse, TransactionType,
  UpdateTransactionResponse,
} from '#common/ResponseTypes';
import Account from '#app/Models/Account';
import TransactionLog from '#app/Models/TransactionLog';
import Statement from '#app/Models/Statement';
import transactionFields, { getChanges,
   getAccountTransactionChanges } from './transactionFields.js';
import { ModelObject, ModelAdapterOptions } from "@adonisjs/lucid/types/model";
import { updateTransaction } from '#validators/transaction';
import { transactionSearchAmount } from '#app/validation/monetaryAmount';
import { validateCentTransactionSplits } from '#app/validation/transactionSplits';

function budgetCategories(budgetId: number, options?: ModelAdapterOptions) {
  return Category.query(options)
    .whereHas('group', (query) => query.where('budgetId', budgetId));
}

export default class TransactionsController {

  public async get({
    request,
    auth: { user },
  }: HttpContext): Promise<ApiResponse<Transaction>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { trxId } = request.params();

    const transaction = await Transaction.query()
      .where('id', trxId)
      .andWhere('budgetId', user.budgetId)
      .andWhere('deleted', false)
      .firstOrFail();

    await transaction.load('accountTransaction');

    return { data: transaction };
  }


  public async getMultiple({
    request,
    auth: { user },
  }: HttpContext): Promise<ApiResponse<TransactionsResponse>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    let { t } = request.qs();

    if (!Array.isArray(t)) {
      t = [t];
    }

    const transactionIds: string[] = t.map(String);
    for (const id of new Set(transactionIds)) {
      await Transaction.query()
        .where('id', id)
        .andWhere('budgetId', user.budgetId)
        .andWhere('deleted', false)
        .firstOrFail();
    }

    const transactions = await Transaction.query()
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .whereIn('id', transactionIds)
      .andWhere('budgetId', user.budgetId)
      .andWhere('deleted', false);

    return {
      data: {
        transactions: transactions.map((transaction) => (
          transaction.serialize(transactionFields) as TransactionProps
        )),
        balance: '0.00',
      },
    };
  }


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
    const requestData = await request.validateUsing(updateTransaction);

    const trx = await db.transaction();

    try {
      user.useTransaction(trx)

      let changes = {};

      const budget = await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const transaction = await Transaction.query({ client: trx })
        .where('id', trxId)
        .andWhere('budgetId', budget.id)
        .andWhere('deleted', false)
        .firstOrFail();

      // Only perform the update if the versions maatch
      if (transaction.version !== requestData.version) {
        await trx.rollback();

        response.status(409);

        return {
          errors: [{
            code: RequestErrorCode.INCORRECT_VERSION,
            status: '409',
            detail:
              'The version of the transaction does not match the version stored in the database.'
          }],
        }
      }

      const categoriesResult: CategoryBalanceProps[] = [];

      // Get the 'unassigned' category id
      const unassigned = await budget.getUnassignedCategory({ client: trx });

      const acctTrans = await transaction.related('accountTransaction').query().firstOrFail();
      // const acctTrans = await AccountTransaction.findByOrFail('transactionId', trxId, { client:
      // trx });

      const account = await acctTrans.related('account').query()
        .whereHas('institution', (query) => query.where('budgetId', budget.id))
        .firstOrFail();

      if (account.tracking === TrackingType.Balances) {
        throw new Exception('Balance-tracked accounts cannot have transactions', { status: 422 });
      }

      const categoryIds = new Set([
        ...transaction.categories.map((category) => category.categoryId),
        ...(requestData.categories ?? []).map((category) => category.categoryId),
      ]);
      for (const categoryId of categoryIds) {
        await budgetCategories(budget.id, { client: trx }).where('id',
          categoryId).firstOrFail();
      }

      const taxReplacement = requestData.taxCategories === undefined ? undefined
        : await prepareTaxReplacement(transaction, requestData.taxCategories, request.input(
          'taxCategories'));

      if (requestData.categories !== undefined && hasCategoryStorage(transaction)) {
        requestData.categories = canonicalCategoryAllocations(requestData.categories);
      }

      if (requestData.statementId !== undefined && requestData.statementId !== null) {
        const statement = await Statement.query({ client: trx })
          .where('id', requestData.statementId)
          .whereHas('account', (query) => {
            query.whereHas('institution', (institution) => institution.where('budgetId', budget
              .id));
          })
          .firstOrFail();
        if (statement.accountId !== account.id) {
          throw new Exception('Statement must belong to the transaction account', { status: 422 });
        }
      }
      // const account = await Account.findOrFail(acctTrans.accountId);

      const unassignedCat = await budget.getUnassignedCategory({ client: trx });

      const nextAmountCents = requestData.amount === undefined ? acctTrans.amountCents
        : parseMoneyCents(encodeMonetaryAmount(requestData.amount));
      const replacementCategories = requestData.categories === undefined ? undefined
        : requestData.categories.length === 0 ? [{ categoryId: unassignedCat.id,
          amountCents: nextAmountCents, comment: undefined }]
          : categoryAllocationsToCents(requestData.categories);

      if (transaction.type === TransactionType.MANUAL_TRANSACTION
        && account.tracking === TrackingType.Transactions && account.type !== AccountType.Loan) {
        validateCentTransactionSplits(nextAmountCents,
          replacementCategories ?? transaction.categories);
      }

      // Ordinary effects use independent old/new eligibility; nominal splits stay intact.
      const ordinary = account.type !== AccountType.Loan
        && account.tracking === TrackingType.Transactions
        && [TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION].includes(
          transaction.type);
      const nextDate = requestData.date ?? transaction.date;
      const oldState = { date: transaction.date, deleted: transaction.deleted, pending: acctTrans
        .pending };
      const newState = { ...oldState, date: nextDate };
      const oldCategoryEligible = categoryEligible(oldState, account.startDate);
      const newCategoryEligible = categoryEligible(newState, account.startDate);
      const zeroCents = parseMoneyCents('0.00');
      const accountDeltaCents = ordinary ? subtractMoneyCents(
        accountEligible(newState, account.startDate)
          ? nextAmountCents : zeroCents,
        accountEligible(oldState, account.startDate)
          ? acctTrans.amountCents : zeroCents,
      ) : zeroCents;

      if (ordinary) {
        const oldSplits = transaction.categories.length > 0 ? transaction.categories
          : [{ categoryId: unassignedCat.id, amountCents: acctTrans.amountCents }];
        const nominalNew = replacementCategories ?? transaction.categories;
        const newSplits = nominalNew.length > 0 ? nominalNew
          : [{ categoryId: unassignedCat.id, amountCents: nextAmountCents }];
        if (hasCategoryStorage(transaction)) {
          const deltas = categoryEffectDeltas(oldSplits, newSplits,
            oldCategoryEligible, newCategoryEligible);
          for (const [categoryId, delta] of deltas) {
            if (delta === 0) continue;
            const category = await budgetCategories(budget.id, { client: trx }).where('id',
              categoryId).firstOrFail();
            const balanceCents = addMoneyCents(
              category.balanceCents, delta);
            const balance = formatMoneyCents(balanceCents);
            category.balanceCents = balanceCents;
            await category.save();
            categoriesResult.push({ id: category.id, balance });
          }
        } else {
          const deltas = categoryEffectDeltas(oldSplits, newSplits, oldCategoryEligible,
            newCategoryEligible);
          for (const [categoryId, delta] of deltas) {
            if (delta === 0) continue;
            const category = await budgetCategories(budget.id, { client: trx }).where('id',
              categoryId).firstOrFail();
            category.balanceCents = addMoneyCents(
              category.balanceCents, delta);
            await category.save();
            categoriesResult.push({ id: category.id, balance: formatMoneyCents(
              category.balanceCents) });
          }
        }
      }

      if (!ordinary && replacementCategories !== undefined) {
        const { categories } = transaction;

        if (categories.length > 0) {
          // There are pre-existing category splits.
          // Credit the category balance for each one.

          for (const transCategory of categories) {

            const category = await budgetCategories(budget.id, { client: trx }).where('id',
              transCategory.categoryId).firstOrFail();

            category.balanceCents = subtractMoneyCents(
              category.balanceCents,
              transCategory.amountCents);


            await category.save();

            categoriesResult.push({
              id: category.id,
              balance: formatMoneyCents(category.balanceCents),
            });
          }


        }
        else if (account.tracking === TrackingType.Transactions) {
          // There are no category splits. Debit the 'Unassigned' category
          if (requestData.amount !== undefined) {
            unassigned.balanceCents = subtractMoneyCents(
              unassigned.balanceCents,
              acctTrans.amountCents);
            await unassigned.save();
          }

          categoriesResult.push({
            id: unassigned.id,
            balance: formatMoneyCents(unassigned.balanceCents),
          });
        }

        if (replacementCategories.length > 0) {
          transaction.categories = replacementCategories;

          for (const transCategory of replacementCategories) {

            const category = await budgetCategories(budget.id, { client: trx }).where('id',
              transCategory.categoryId).firstOrFail();

            category.balanceCents = addMoneyCents(
              category.balanceCents,
              transCategory.amountCents);


            await category.save();



            // Determine if the category is already in the array.
            const index = categoriesResult.findIndex((c) => c.id === category.id);

            // If the category is already in the array then simply update the amount.
            // Otherwise, add the category and amount to the array.
            if (index !== -1) {
              categoriesResult[index].balance = formatMoneyCents(category.balanceCents);
            }
            else {
              categoriesResult.push({
                id: category.id,
                balance: formatMoneyCents(category.balanceCents),
              });
            }
          }
        }
        else if (account.tracking === TrackingType.Transactions) {
          // There are no category splits. Debit the 'Unassigned' category
          if (requestData.amount !== undefined) {
            unassigned.balanceCents = addMoneyCents(
              unassigned.balanceCents,
              parseMoneyCents(encodeMonetaryAmount(requestData.amount)));
            await unassigned.save();
          }

          const index = categoriesResult.findIndex((c) => c.id === unassigned.id);

          if (index !== -1) {
            categoriesResult[index].balance = formatMoneyCents(unassigned.balanceCents);
          }
          else {
            categoriesResult.push({
              id: unassigned.id,
              balance: formatMoneyCents(unassigned.balanceCents),
            });
          }
        }
      }

      if (taxReplacement !== undefined) transaction.taxes = taxReplacement;

      let changedStatementId: number | null = null

      if (
        requestData.name !== undefined
        || requestData.amount !== undefined
        || requestData.principle !== undefined
        || requestData.statementId !== undefined
      ) {
        const replacementBalanceCents = !ordinary
          ? subtractMoneyCents(account.balanceCents,
            account.type === AccountType.Loan
              ? acctTrans.principalCents ?? parseMoneyCents('0.00') : acctTrans.amountCents) : null;

        const accountTransactionChanges = {
          ...(requestData.name !== undefined ? { name: requestData.name } : {}),
          ...(requestData.amount !== undefined ? {
            amountCents: parseMoneyCents(encodeMonetaryAmount(requestData.amount)),
          } : {}),
          ...(requestData.principle !== undefined ? {
            principalCents: parseMoneyCents(encodeMonetaryAmount(requestData.principle)),
          } : {}),
          ...(requestData.statementId !== undefined ? {
            statementId: requestData.statementId,
          } : {}),
        };

        changes = getAccountTransactionChanges(acctTrans.$attributes, accountTransactionChanges,
          changes);

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

        if (replacementBalanceCents !== null) {
          account.balanceCents = addMoneyCents(replacementBalanceCents,
            account.type === AccountType.Loan
              ? acctTrans.principalCents ?? parseMoneyCents('0.00') : acctTrans.amountCents);
        }

        if (!ordinary) await account.save();
      }

      if (ordinary && accountDeltaCents !== 0) {
        const balanceCents = addMoneyCents(
          account.balanceCents, accountDeltaCents);
        account.balanceCents = balanceCents;
        await account.save();
      }

      const transactionChanges: ModelObject = {
        date: requestData.date,
        comment: requestData.comment,
        categories: replacementCategories,
      }

      changes = getChanges(transaction.$attributes, transactionChanges, changes);

      transactionChanges.version = transaction.version + 1;


      for (const property of Object.getOwnPropertyNames(transactionChanges)) {
        if (transactionChanges[property] === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete transactionChanges[property]
        }
      }

      transaction.merge(transactionChanges);

      await transaction.save();
      if (requestData.categories !== undefined || requestData.amount !== undefined) {
        await validateStoredCategoryConservation(transaction);
      }

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

      for (const cat of categoriesResult) {

        const category = await budgetCategories(budget.id, { client: trx }).where('id', cat.id)
          .firstOrFail();


        cat.count = await category.transactionsCount(budget);
      }

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
            balance: formatMoneyCents(account.balanceCents),
          }],
          statement: statement?.serialize() as StatementProps,
        },
      }

      await trx.commit();

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }


  public async dedup({
    request,
    auth: { user },
  }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    await db.transaction(async (trx) => {
      user.useTransaction(trx);
      await user.related('budget').query().forUpdate().firstOrFail();

      const { trxId } = request.params();

      const transaction = await Transaction.query({ client: trx })
        .where('id', trxId)
        .andWhere('budgetId', user.budgetId)
        .andWhere('deleted', false)
        .firstOrFail();

      transaction.duplicateOfTransactionId = null;

      await transaction.save();
    });
  }


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

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);
      const budget = await user.related('budget').query().forUpdate().firstOrFail();

      const result: {
        categories: CategoryBalanceProps[],
        acctBalances: AccountBalanceProps[],
      } = { categories: [], acctBalances: [] };

      const { trxId } = request.params();

      const transaction = await Transaction.query({ client: trx })
        .where('id', trxId)
        .andWhere('budgetId', budget.id)
        .andWhere('deleted', false)
        .firstOrFail();

      const acctTransaction = await AccountTransaction.findBy('transactionId', transaction.id, {
        client: trx });

      let account: Account | null = null;

      if (acctTransaction) {
        account = await Account.query({ client: trx })
          .where('id', acctTransaction.accountId)
          .whereHas('institution', (query) => query.where('budgetId', budget.id))
          .firstOrFail();
      }

      if (account?.tracking === TrackingType.Balances) {
        throw new Exception('Balance-tracked accounts cannot have transactions', { status: 422 });
      }

      const trxCategories = transaction.categories;

      for (const categoryId of new Set(trxCategories.map((category) => category.categoryId))) {
        await budgetCategories(budget.id, { client: trx }).where('id', categoryId).firstOrFail();
      }

      if (trxCategories.length === 0) {
        if (account && account.tracking === TrackingType.Transactions) {
          if (!acctTransaction) {
            throw new Error('acctTransaction is null');
          }

          const unassignedCat = await budget.getUnassignedCategory({ client: trx });

          const balanceCents = subtractMoneyCents(
            unassignedCat.balanceCents,
            acctTransaction.amountCents);
          unassignedCat.balanceCents = balanceCents;

          result.categories.push({ id: unassignedCat.id, balance: formatMoneyCents(
            unassignedCat.balanceCents) });

          await unassignedCat.save();
        }
      }
      else {

        for (const trxCat of trxCategories) {

          const category = await budgetCategories(budget.id, { client: trx }).where('id', trxCat
            .categoryId).firstOrFail();

          const balanceCents = subtractMoneyCents(
            category.balanceCents,
            trxCat.amountCents);
          category.balanceCents = balanceCents;

          const balance = result.categories.find((b) => b.id === category.id);

          if (balance) {
            balance.balance = formatMoneyCents(category.balanceCents);
          }
          else {
            result.categories.push({ id: category.id, balance: formatMoneyCents(
              category.balanceCents) });
          }



          await category.save();


          // await trxCat.delete();
        }
      }

      if (account) {
        if (!acctTransaction) {
          throw new Error('acctTransaction is null');
        }

        if (!acctTransaction.pending) {
          if (account.type === AccountType.Loan) {
            const balanceCents = subtractMoneyCents(
              account.balanceCents,
              acctTransaction.principalCents ?? parseMoneyCents('0.00'));
            account.balanceCents = balanceCents;
          }
          else {
            const balanceCents = subtractMoneyCents(
              account.balanceCents,
              acctTransaction.amountCents);
            account.balanceCents = balanceCents;
          }

          await account.save();

          result.acctBalances.push({ id: account.id, balance: formatMoneyCents(
            account.balanceCents) });
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
        balance: '0.00',
      },
    }
  }


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

    let nameSearch = request.qs().name;
    if (nameSearch) {
      nameSearch = nameSearch.trim()
    }

    const amountSearch = transactionSearchAmount(request.qs().amount);

    const search = budget.related('transactions').query()
      .where('deleted', false)
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .limit(request.qs().limit)
      .offset(request.qs().offset)
      .orderBy('date', 'desc')

    if (nameSearch) {
      search.whereHas('accountTransaction', (q) => {
        q.whereILike('name', `%${nameSearch}%`)
      })
    }

    if (amountSearch) {
      search.whereHas('accountTransaction', (q) => {
        q.where('amount', amountSearch)
      })
    }

    const results = await search;

    return {
      data: {
        transactions: results.map((t) => (
          t.serialize(transactionFields) as TransactionProps
        )),
        balance: '0.00',
      },
    };
  }


  public async logs({
    auth: {
      user,
    },
  }: HttpContext): Promise<ApiResponse<TransactionLog[]>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const logs = await budget.related('transactionLog').query().orderBy('createdAt', 'desc');

    return { data: logs };
  }
}
