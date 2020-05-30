const Database = use('Database');

class AccountController {
    static async transactions({ request }) {
        const accountId = parseInt(request.params.acctId, 10);

        const result = { transactions: [] };

        const balance = await Database.select(
            Database.raw('CAST(balance AS real) AS balance'),
        )
            .table('accounts')
            .where('id', accountId);

        if (balance.length > 0) {
            result.balance = balance[0].balance;

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
                .table('category_splits AS splits')
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
            )
                .table('transactions AS trans')
                .join('account_transactions AS acct_trans', 'acct_trans.transaction_id', 'trans.id')
                .join('accounts AS acct', 'acct.id', 'acct_trans.account_id')
                .join('institutions AS inst', 'inst.id', 'acct.institution_id')
                .leftJoin(subquery.as('splits'), 'splits.transaction_id', 'trans.id')
                .where('acct_trans.account_id', accountId)
                .orderBy('date', 'desc')
                .orderBy('acct_trans.name');
        }

        return result;
    }
}

module.exports = AccountController
