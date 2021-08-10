// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';
import Transaction from 'App/Models/Transaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import Loan from 'App/Models/Loan';
import LoanTransaction from 'App/Models/LoanTransaction';
import AccountTransaction from 'App/Models/AccountTransaction';
import { AccountBalanceProps, CategoryBalanceProps, LoanTransactionProps } from 'Common/ResponseTypes';
import Account from 'App/Models/Account';
import { rules, schema } from '@ioc:Adonis/Core/Validator';

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

    const validationSchema = schema.create({
      name: schema.string.optional({ trim: true }),
      amount: schema.number.optional(),
      date: schema.date.optional(),
      splits: schema.array().members(
        schema.object().members({
          categoryId: schema.number(),
          amount: schema.number(),
        })
      ),
    });

    const { txId } = request.params();
    const requestData = await request.validate({
      schema: validationSchema,
    });
  
    const trx = await Database.transaction();

    type Result = {
      categories: CategoryBalanceProps[],
      transaction?: Transaction,
      loan?: LoanProps,
    };

    const result: Result = {
      categories: [],
    };

    if (requestData.date !== undefined) {
      const transaction = await Transaction.findOrFail(txId, { client: trx });

      transaction.merge({
        date: requestData.date,
      });

      await transaction.save();
    }

    // Get the 'unassigned' category id
    const unassigned = await Category.getUnassignedCategory(user, { client: trx });

    const splits = await TransactionCategory.query({ client: trx })
      .preload('loanTransaction')
      .where('transactionId', txId);

    if (splits.length > 0) {
      // There are pre-existing category splits.
      // Credit the category balance for each one.
      for (let split of splits) {
        const category = await Category.findOrFail(split.categoryId, { client: trx });

        category.amount -= split.amount;

        await category.save();

        result.categories.push({ id: category.id, balance: category.amount });
      };

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

      const trans = await AccountTransaction.findByOrFail('transaction_id', txId, { client: trx });

      const category = await Category.findOrFail(unassigned.id, { client: trx });

      category.amount -= trans.amount;

      await category.save();

      result.categories.push({ id: category.id, balance: category.amount });
    }

    const requestedSplits = requestData.splits;

    if (requestedSplits.length > 0) {
      for (let split of requestedSplits) {
        const txCategory = (new TransactionCategory()).useTransaction(trx);

        txCategory.fill({
          categoryId: split.categoryId,
          amount: split.amount,
          transactionId: txId,
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
          result.categories.push({ id: category.id, balance: category.amount });
        }
      };
    }

    if (requestData.name !== undefined
      || requestData.amount !== undefined) {
      const acctTransaction = await AccountTransaction.findByOrFail('transactionId', txId, { client: trx });

      acctTransaction.merge({
        name: requestData.name,
        amount: requestData.amount,
      });

      await acctTransaction.save();
    }

    result.transaction = await Transaction.findOrFail(txId, { client: trx });

    await result.transaction.load('transactionCategories');

    await result.transaction.load('accountTransaction');

    await trx.commit();

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<{ balances: CategoryBalanceProps[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    const result: {
      balances: CategoryBalanceProps[],
      acctBalances: AccountBalanceProps[],
    } = { balances: [], acctBalances: [] };

    const { trxId } = request.params();

    const transaction = await Transaction.findOrFail(trxId, { client: trx });

    const acctTransaction = await AccountTransaction.findBy('transactionId', transaction.id, { client: trx });

    const trxCategories = await transaction.related('transactionCategories').query();

    if (trxCategories.length === 0) {
      if (!acctTransaction) {
        throw new Error('acctTransaction is null');
      }

      const unassignedCat = await Category.getUnassignedCategory(user, { client: trx });

      unassignedCat.amount -= acctTransaction.amount;

      result.balances.push({ id: unassignedCat.id, balance: unassignedCat.amount });

      await unassignedCat.save();
    }
    else {
      for (let trxCat of trxCategories) {
        const category = await Category.findOrFail(trxCat.categoryId, { client: trx });
  
        category.amount -= trxCat.amount;

        const balance = result.balances.find((b) => b.id === category.id);

        if (balance) {
          balance.balance = category.amount;
        }
        else {
          result.balances.push({ id: category.id, balance: category.amount });
        }

        if (category.type === 'LOAN') {
          const loanTransaction = await trxCat.related('loanTransaction').query().firstOrFail();

          await loanTransaction.delete();

          const loan = await loanTransaction.related('loan').query().firstOrFail();

          loan.updateBalance();
        }

        category.save();

        await trxCat.delete();
      };  
    }

    if (acctTransaction) {
      const account = await Account.findOrFail(acctTransaction.accountId, { client: trx });

      account.balance -= acctTransaction.amount;

      account.save();

      result.acctBalances.push({ id: account.id, balance: account.balance });

      await acctTransaction.delete();
    }

    await transaction.delete();

    await trx.commit();

    return result;
  }
}
