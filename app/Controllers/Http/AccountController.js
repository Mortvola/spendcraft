'use strict'

const Database = use('Database');


class AccountController {
    
    async transactions ({request}) {
        
        let accountId = parseInt(request.params.acctId);

        let result = { transactions: []};
        
        let balance = await Database.select (
                Database.raw("CAST(balance AS real) AS balance"))
            .table("accounts")
            .where("id", accountId);
        
        if (balance.length > 0) {
            result.balance = balance[0].balance;
            
            let subquery = Database.select (
                Database.raw("sum(splits.amount) AS sum"),
                Database.raw("json_agg ((" +
                    "'{\"categoryId\": ' || category_id || " +
                    "', \"amount\": ' || splits.amount || " +
                    "', \"category\": ' || '\"' || cats.name || '\"' || " +
                    "', \"group\": ' || '\"' || groups.name || '\"' || " +
                    "'}')::json) AS categories"), "transaction_id")
            .table("category_splits AS splits")
            .join ("categories AS cats", "cats.id", "splits.category_id")
            .join ("groups", "groups.id", "cats.group_id")
            .groupBy ("transaction_id");

            result.transactions = await Database.select(
                    "trans.id AS id", 
                    Database.raw("0 AS type"),
                    Database.raw("COALESCE(trans.sort_order, 2147483647) AS sort_order"),
                    Database.raw("date::text"),
                    "trans.name AS name",
                    "splits.categories AS categories",
                    "inst.name AS institute_name",
                    "acct.name AS account_name",
                    Database.raw("CAST(trans.amount AS real) AS amount"))
                .table("transactions AS trans")
                .join("accounts AS acct", "acct.id", "trans.account_id")
                .join("institutions AS inst", "inst.id", "acct.institution_id")
                .leftJoin(subquery.as('splits'), "splits.transaction_id", "trans.id")
                .where ("trans.account_id", accountId)
                .orderBy ("date", "desc")
                .orderBy ("trans.name");
        }

        return result;
    }
}

module.exports = AccountController
