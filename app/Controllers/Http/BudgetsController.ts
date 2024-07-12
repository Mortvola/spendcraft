import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Database from '@ioc:Adonis/Lucid/Database';
import { ApiResponse, SyncResponse, TransactionProps } from 'Common/ResponseTypes';
import Budget from 'App/Models/Budget';
import transactionFields from './transactionFields';

export default class BudgetsController {
  // eslint-disable-next-line class-methods-use-this
  public async sync({
    request,
    auth: { user },
  }: HttpContextContract): Promise<ApiResponse<SyncResponse>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    try {
      const budget = await user.related('budget').query()
        .useTransaction(trx)
        .forUpdate()
        .firstOrFail();

      const { since, revision } = request.qs();
      let transactionIds: number[] | undefined;

      const revisions = await budget.related('budgetChange').query()
        .where('id', '>', revision ?? 0)
        .orderBy('id', 'desc');

      // If 'revision' query parameter is present then the 
      // request is a sync since that revision.
      if (revision) {
        transactionIds = [];

        // eslint-disable-next-line no-restricted-syntax
        for (const rev of revisions) {
          if (rev.change.transactions) {
            transactionIds = transactionIds.concat(rev.change.transactions.modified);
          }
        }

        // Remove any duplicates
        transactionIds = [...new Set(transactionIds)];
      }

      const transactions = await BudgetsController.getTransactions(budget, since, transactionIds)

      await trx.rollback();

      return {
        data: {
          revision: revisions.length > 0 ? revisions[0].id ?? 0 : (revision ?? 0),
          transactions: {
            modified: transactions,
            deleted: [],
          },
        },
      }
    }
    catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  private static async getTransactions(budget: Budget, since: string, t?: number[]): Promise<TransactionProps[]> {
    let query = budget.related('transactions').query()
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories')
      .andWhere('deleted', false);

    if (t) {
      query = query.whereIn('id', t)
    }

    if (since) {
      query = query.andWhere('date', '>=', since)
    }

    // console.log(query.toQuery());

    const transactions = await query;

    return transactions.map((transaction) => (
      transaction.serialize(transactionFields) as TransactionProps
    ));
  }
}
