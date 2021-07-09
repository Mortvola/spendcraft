import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Account from 'App/Models/Account';
import AccountTransaction from 'App/Models/AccountTransaction';
import BalanceHistory from 'App/Models/BalanceHistory';
import Institution from 'App/Models/Institution';
import TransactionCategory from 'App/Models/TransactionCategory';

type Transactions = {
  transactions: Array<AccountTransaction>,
  pending: Array<AccountTransaction>,
  balance: number,
};

export default class AccountsController {
  // eslint-disable-next-line class-methods-use-this
  public async transactions({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Transactions> {
    if (!user) {
      throw new Error('user not defined');
    }

    const accountId = parseInt(request.params().acctId, 10);

    const result: Transactions = {
      transactions: [],
      pending: [],
      balance: 0,
    };

    // Determine if the account belongs to the authenticated user
    // and get the balance
    const account = await Account.find(accountId);

    if (account) {
      const institution = await Institution.findOrFail(account.institutionId);

      if (institution.userId === user.id) {
        result.balance = account.balance;

        const transactions = await account.related('accountTransactions')
          .query()
          .select(
            'account_transactions.*',
            Database.raw("to_char(date  AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS date"),
            'transaction_id',
          )
          .join('transactions', 'transactions.id', 'transaction_id')
          .orderBy('account_transactions.pending', 'desc')
          .orderBy('transactions.date', 'desc')
          .orderBy('account_transactions.name');

        result.transactions = transactions;

        if (result.transactions.length > 0) {
          // Move pending transactions to the pending array
          // Find first transaction that is not pending (all pending
          // should be up front in the array)
          const index = result.transactions.findIndex((t) => !t.pending);

          if (index === -1) {
            // The array contains only pending transactions
            result.pending = result.transactions;
            result.transactions = [];
          }
          else if (index > 0) {
            // The array contains at least one pending transaction
            result.pending = result.transactions.splice(0, index);
          }

          const transctionIds = result.transactions.map((t) => t.transactionId);

          const categories = await TransactionCategory.query().whereIn('transaction_id', transctionIds);

          result.transactions.forEach((transaction) => {
            transaction.$extras.categories = categories.filter(
              (c) => c.transactionId === transaction.transactionId,
            );
          });
        }
      }
    }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async balances({ request }: HttpContextContract): Promise<Array<BalanceHistory>> {
    const accountId = parseInt(request.params().acctId, 10);
    const account = await Account.find(accountId);

    if (account) {
      await account.load('balanceHistory', (query) => {
        query.orderBy('date', 'asc');
      });

      return account.balanceHistory;
    }

    return [];
  }
}
