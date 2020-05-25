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
                Database.raw('0 AS type'),
                Database.raw('COALESCE(trans.sort_order, 2147483647) AS sort_order'),
                Database.raw('date::text'),
                'acctTrans.name AS name',
                'splits.categories AS categories',
                'inst.name AS institute_name',
                'acct.name AS account_name',
                Database.raw('CAST(acctTrans.amount AS real) AS amount'),
            )
                .table('transactions AS trans')
                .jon('account_transactions AS acctTrans', 'acctTrans.transaction_id', 'trans.id')
                .join('accounts AS acct', 'acct.id', 'acctTrans.account_id')
                .join('institutions AS inst', 'inst.id', 'acct.institution_id')
                .leftJoin(subquery.as('splits'), 'splits.transaction_id', 'trans.id')
                .where('acctTrans.account_id', accountId)
                .orderBy('date', 'desc')
                .orderBy('acctTrans.name');
        }

        return result;
    }
}

module.exports = AccountController
