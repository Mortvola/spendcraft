const Database = use('Database');

class AccountController {
    static async transactions({ request, auth }) {
        const accountId = parseInt(request.params.acctId, 10);

        const result = { transactions: [], pending: [] };

        const [{ balance }] = await Database.select(
            Database.raw('CAST(balance AS real) AS balance'),
        )
            .table('accounts')
            .where('id', accountId);

        if (balance !== undefined) {
            result.balance = balance;

            const subquery = Database.select(
                Database.raw('sum(splits.amount) AS sum'),
                Database.raw('json_agg (('
                    + "'{\"categoryId\": ' || category_id || "
                    + "', \"amount\": ' || splits.amount || "
                    + "', \"category\": ' || '\"' || cats.name || '\"' || "
                    + "', \"group\": ' || '\"' || groups.name || '\"' || "
                    + "'}')::json) AS categories"),
                'transaction_id',
            )
                .table('transaction_categories AS splits')
                .join('categories AS cats', 'cats.id', 'splits.category_id')
                .join('groups', 'groups.id', 'cats.group_id')
                .groupBy('transaction_id');

            result.transactions = await Database.select(
                'trans.id AS id',
                'trans.type AS type',
                Database.raw('COALESCE(trans.sort_order, 2147483647) AS sort_order'),
                Database.raw('date::text'),
                'acct_trans.name AS name',
                'splits.categories AS categories',
                'inst.name AS institute_name',
                'acct.name AS account_name',
                Database.raw('CAST(acct_trans.amount AS real) AS amount'),
                'acct_trans.pending AS pending',
            )
                .table('transactions AS trans')
                .join('account_transactions AS acct_trans', 'acct_trans.transaction_id', 'trans.id')
                .join('accounts AS acct', 'acct.id', 'acct_trans.account_id')
                .join('institutions AS inst', 'inst.id', 'acct.institution_id')
                .leftJoin(subquery.as('splits'), 'splits.transaction_id', 'trans.id')
                .where('acct_trans.account_id', accountId)
                .andWhere('inst.user_id', auth.user.id)
                .orderBy('acct_trans.pending', 'desc')
                .orderBy('date', 'desc')
                .orderBy('acct_trans.name');

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
            }
        }

        return result;
    }

    static async balances({ request }) {
        const accountId = parseInt(request.params.acctId, 10);

        const balances = await Database.select(
            Database.raw('date::text'),
            Database.raw('CAST(balance AS real) AS balance'),
        )
            .from('balance_histories')
            .where('account_id', accountId)
            .orderBy('date', 'asc');

        return balances;
    }
}

module.exports = AccountController
