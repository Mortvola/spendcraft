// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';
import Transaction from 'App/Models/Transaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import Loan from 'App/Models/Loan';
import LoanTransaction from 'App/Models/LoanTransaction';
import AccountTransaction from 'App/Models/AccountTransaction';
import { CategoryType, LoanTransactionProps } from 'Common/ResponseTypes';

type LoanProps = {
  balance: number,
  transactions: LoanTransactionProps[],
};

export default class TransactionsController {
  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    type CatBalance = {
      type: CategoryType,
      id: number,
      balance: number,
    };

    type Result = {
      categories: CatBalance[],
      splits: unknown[],
      loan?: LoanProps,
    };

    const result: Result = {
      categories: [],
      splits: [],
    };

    // Get the 'unassigned' category id
    const unassigned = await Category.getUnassignedCategory(user);

    const splits = await TransactionCategory.query({ client: trx })
      .preload('loanTransaction')
      .where('transactionId', request.params().txId);

    if (splits.length > 0) {
      // There are pre-existing category splits.
      // Credit the category balance for each one.
      await Promise.all(splits.map(async (split) => {
        const category = await Category.findOrFail(split.categoryId, { client: trx });

        category.amount -= split.amount;

        await category.save();

        result.categories.push({ type: category.type, id: category.id, balance: category.amount });
      }));

      // Delete any loan transactions that are associated with the categories being deleted.
      await Promise.all(splits.map(async (split) => {
        if (split.loanTransaction) {
          split.loanTransaction.delete();
          const loan = await Loan.findByOrFail('categoryId', split.categoryId, { client: trx });
          await loan.updateBalance();
        }

        split.delete();
      }));
    }
    else {
      // There are no category splits. Debit the 'Unassigned' category

      const trans = await AccountTransaction.findByOrFail('transaction_id', request.params().txId, { client: trx });

      const category = await Category.findOrFail(unassigned.id, { client: trx });

      category.amount -= trans.amount;

      await category.save();

      result.categories.push({ type: category.type, id: category.id, balance: category.amount });
    }

    const requestedSplits = request.input('splits');

    if (requestedSplits.length > 0) {
      await Promise.all(requestedSplits.map(async (split) => {
        const txCategory = (new TransactionCategory()).useTransaction(trx);

        txCategory.fill({
          categoryId: split.categoryId,
          amount: split.amount,
          transactionId: request.params().txId,
        });

        txCategory.save();

        const category = await Category.findOrFail(split.categoryId, { client: trx });

        category.amount += split.amount;

        await category.save();

        if (category.type === 'LOAN') {
          const loanTrx = (new LoanTransaction()).useTransaction(trx);

          const loan = await Loan.findByOrFail('categoryId', split.categoryId, { client: trx });

          loanTrx.fill({
            loanId: loan.id,
            principle: 0,
          });

          await loanTrx.related('transactionCategory').associate(txCategory);
          await loan.updateBalance();
        }

        // Determine if the category is already in the array.
        const index = result.categories.findIndex((c) => c.id === category.id);

        // If the category is already in the array then simply update the amount.
        // Otherwise, add the category and amount to the array.
        if (index !== -1) {
          result.categories[index].balance = category.amount;
        }
        else {
          result.categories.push({ type: category.type, id: category.id, balance: category.amount });
        }
      }));
    }

    const transCats = await trx.query()
      .select(
        'category_id as categoryId',
        Database.raw('CAST(splits.amount AS float) AS amount'),
        'cats.name AS category',
        'groups.name AS group',
      )
      .from('transaction_categories AS splits')
      .join('categories AS cats', 'cats.id', 'splits.category_id')
      .join('groups', 'groups.id', 'cats.group_id')
      .where('splits.transaction_id', request.params().txId);

    result.splits = [];
    if (transCats.length > 0) {
      result.splits = transCats;
    }

    await trx.commit();

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete(
    { request }: HttpContextContract,
  ): Promise<{ balances: { id: number, balance: number}[] }> {
    const trx = await Database.transaction();

    const result: {
      balances: { id: number, balance: number}[],
    } = { balances: [] };

    try {
      const { trxId } = request.params();

      const transaction = await Transaction.findOrFail(trxId, { client: trx });

      const trxCategories = await transaction.related('transactionCategories').query();

      await Promise.all(trxCategories.map(async (trxCat) => {
        const category = await Category.find(trxCat.categoryId, { client: trx });

        if (category) {
          category.amount -= trxCat.amount;

          result.balances.push({ id: category.id, balance: category.amount });

          category.save();

          await trxCat.delete();
        }
      }));

      await transaction.delete();

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
    }

    return result;
  }
}
