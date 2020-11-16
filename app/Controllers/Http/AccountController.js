const BalanceHistory = use('App/Models/BalanceHistory');
const Account = use('App/Models/Account');

class AccountController {
  static async transactions({ request, auth: { user } }) {
    const accountId = parseInt(request.params.acctId, 10);

    const result = { transactions: [], pending: [] };

    // Determine if the account belongs to the authenticated user
    // and get the balance
    const account = await Account.find(accountId);

    if (account !== undefined) {
      const institution = await account.institution().fetch();
      const owner = await institution.user().fetch();

      if (user.id === owner.id) {
        result.balance = parseFloat(account.balance);

        result.transactions = await account.accountTransactions()
          .setVisible(['name', 'amount', 'pending', 'date', 'id', 'type', 'sort_order'])
          .join('transactions', 'transactions.id', 'account_transactions.transaction_id')
          .with('categories', (builder) => {
            builder.setVisible(['category_id']);
          })
          .orderBy('account_transactions.pending', 'desc')
          .orderBy('transactions.date', 'desc')
          .orderBy('account_transactions.name')
          .fetch();

        if (result.transactions.rows.length > 0) {
          // Move pending transactions to the pending array
          // Find first transaction that is not pending (all pending
          // should be up front in the array)
          const index = result.transactions.rows.findIndex((t) => !t.pending);

          if (index === -1) {
            // The array contains only pending transactions
            result.pending = result.transactions;
            result.transactions = [];
          }
          else if (index > 0) {
            // The array contains at least one pending transaction
            result.pending = result.transactions.rows.splice(0, index);
          }
        }
      }
    }

    return result;
  }

  static async balances({ request }) {
    const accountId = parseInt(request.params.acctId, 10);

    return BalanceHistory.query()
      .setVisible(['date', 'balance'])
      .where('account_id', accountId)
      .orderBy('date', 'asc')
      .fetch();
  }
}

module.exports = AccountController;
