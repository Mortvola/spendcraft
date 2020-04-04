'use strict'

const Database = use('Database');
const Env = use('Env')

var plaid = require('plaid');
var moment = require('moment');

var plaidClient = new plaid.Client(
    Env.get ('PLAID_CLIENT_ID'),
    Env.get ('PLAID_SECRET'),
    Env.get ('PLAID_PUBLIC_KEY'),
    plaid.environments[Env.get('PLAID_ENV')],
    {version: '2019-05-29', clientApp: escape(Env.get('APP_NAME'))}
  );


class InstitutionController {
    
    async all ({auth}) {
        return await this.getConnectedAccounts (auth);
    }

    async getConnectedAccounts (auth) {
        // Check to see if we already have the institution. If not, add it.
        let result = await Database.select(
                "inst.id AS institutionId", 
                "inst.name AS institutionName", 
                "acct.id AS accountId", 
                "acct.name AS accountName")
            .table("institutions AS inst")
            .leftJoin ("accounts AS acct",  "acct.institution_id",  "inst.id")
            .where ('inst.user_id', auth.user.id)
            .orderBy("inst.name")
            .orderBy("acct.name");
                
        let institutions = [];
        let institution = null;
        
        for (let acct of result) {
            if (!institution) {
                institution = { id: acct.institutionId, name: acct.institutionName, accounts: [] };
            }
            else if (institution.name !== acct.institutionName) {
                institutions.push(institution);
                institution = { id: acct.institutionId, name: acct.institutionName, accounts: [] };
            }
            
            if (acct.accountId) {
                institution.accounts.push({ id: acct.accountId, name: acct.accountName });
            }
        }
        
        if (institution) {
            institutions.push(institution);
        }
        
        return institutions;
    }

    async add ({request, auth}) {

        let {institution, publicToken} = request.only (['institution', 'publicToken']);
        
        
        // Check to see if we already have the institution. If not, add it.
        let inst = await Database.table('institutions').where ({institution_id: institution.institution_id, user_id: auth.user.id});

        let accessToken;
        let institutionId;
        
        if (inst.length === 0) {
            
            let tokenResponse = await plaidClient.exchangePublicToken(publicToken);
            
            accessToken = tokenResponse.access_token;

            let instId = await Database.insert({ institution_id: institution.institution_id, name: institution.name, access_token: accessToken, user_id: auth.user.id }).into('institutions').returning('id'); 
            
            institutionId = instId[0];
        }
        else {
            accessToken = inst[0].access_token;
            institutionId = inst[0].id;
        }

        let result = {
            id: institutionId,
            name: institution.name
        };

        result.accounts = await this.getAccounts(accessToken, institutionId);
        
        return result;
    }
    
    async getAccounts (accessToken, institutionId) {

        let accountsResponse = await plaidClient.getAccounts(accessToken);
        
        let accounts = accountsResponse.accounts;
        
        let existingAccts = await Database.select("plaid_account_id").from("accounts").where("institution_id", institutionId);
        
        for (let existingAcct of existingAccts) {
            
            let index = accounts.findIndex(a => a.account_id == existingAcct.plaid_account_id);
            
            if (index !== -1) {
                accounts.splice(index, 1);
            }
        }
        
        return accounts;
    }
    
    async get ({request, auth}) {

        let inst = await Database.select('access_token').from('institutions').where ({id: request.params.instId, user_id: auth.user.id});

        let accounts = []; 
        if (inst.length > 0) {
            accounts = await this.getAccounts (inst[0].access_token, request.params.instId);
        }

        return accounts;
    }
    
    async addAccounts ({request, auth}) {
        const trx = await Database.beginTransaction ();
        
        let fundingAmount = 0;
        let unassignedAmount = 0;

        let systemCats = await trx.select ('cats.id AS id', 'cats.name AS name')
            .from ('categories AS cats')
            .join('groups', 'groups.id', 'group_id')
            .where('cats.system', true)
            .andWhere ('groups.user_id', auth.user.id);
        let fundingPool = systemCats.find (entry => entry.name == "Funding Pool");
        let unassigned = systemCats.find (entry => entry.name == "Unassigned");
        
        let inst = await trx.select ("access_token").from("institutions").where ({id: request.params.instId, user_id: auth.user.id});
        
        if (inst.length > 0) {
            for (let account of request.body.accounts) {
                
                let exists = await trx.select (Database.raw("EXISTS (SELECT 1 FROM accounts WHERE plaid_account_id = '" + account.account_id + "') AS exists"));
                
                if (!exists[0].exists) {
                    let acctId = await trx.insert(
                        { plaid_account_id: account.account_id, name: account.name, official_name: account.official_name, mask: account.mask,
                          subtype: account.subtype, type: account.type, institution_id: request.params.instId, 
                          start_date: request.body.startDate, balance: account.balances.current, tracking: account.tracking, enabled: true}).into('accounts').returning('id');
                    
                    if (account.tracking == "Transactions") {
                        
                        let details = await this.addTransactions (trx, inst[0].access_token, acctId[0], account.account_id, request.body.startDate, auth);

                        if (details.cat) {
                            unassignedAmount = details.cat.amount;
                        }
                        
                        let startingBalance = details.balance + details.sum;
                        
                        // Insert the "starting balance" transaction
                        let transId = await trx.insert(
                            {transaction_id: null, account_id: acctId[0], name: 'Starting Balance', date: request.body.startDate,
                             amount: startingBalance, sort_order: -1}).into ('transactions').returning('id');
                        
                        await trx.insert(
                            { transaction_id: transId[0], category_id: fundingPool.id, amount: startingBalance }).into('category_splits');
                        
                        let funding = await this.subtractFromCategoryBalance (trx, fundingPool.id, -startingBalance);
                        
                        fundingAmount = funding.amount;
                    }
                }
            }
        }

        await trx.commit ();
        
        let accounts = await this.getConnectedAccounts (auth);
        
        return {accounts: accounts, categories: [{id: fundingPool.id, amount: fundingAmount}, {id: unassigned.id, amount: unassignedAmount}]};
    }
    
    async addTransactions (trx, accessToken, accountId, plaidAccountId, startDate, auth)
    {
        var startDate = moment(startDate).format('YYYY-MM-DD');
        var endDate = moment().format('YYYY-MM-DD');
        
        let transactionsResponse = await plaidClient.getTransactions(accessToken, startDate, endDate, {
            count: 250,
            offset: 0,
            account_ids: [plaidAccountId]
        });

        let sum = 0;
        let pendingSum = 0;
        
        for (let transaction of transactionsResponse.transactions) {

            // Only consider non-pending transactions
            if (!transaction.pending) {

                // First check to see if the transaction is present. If it is then don't insert it.
                let exists = await trx.select(Database.raw("EXISTS (SELECT 1 FROM transactions WHERE transaction_id = '" + transaction.transaction_id + "') AS exists"));
                
                if (!exists[0].exists) {
                    
                    await trx.insert({transaction_id: transaction.transaction_id, account_id: accountId,
                          name: transaction.name, date: transaction.date, amount: -transaction.amount}).into('transactions');
                      
                    sum += transaction.amount;
                }
            }
            else {
                pendingSum += transaction.amount;
            }
        }
        
        let balance = transactionsResponse.accounts[0].balances.current;
        
        let cat = null;
        
        if (sum != 0) {
            let systemCats = await trx.select ('cats.id AS id', 'cats.name AS name')
                .from ('categories AS cats')
                .join('groups', 'groups.id', 'group_id')
                .where('cats.system', true)
                .andWhere ('groups.user_id', auth.user.id);
            let unassigned = systemCats.find (entry => entry.name == "Unassigned");

            // Add the sum of the transactions to the unassigned category.
            cat = await this.subtractFromCategoryBalance (trx, unassigned.id, sum);
        }

        if (transactionsResponse.accounts[0].type == "credit" ||
            transactionsResponse.accounts[0].type == "loan") {
            
            balance = -balance;
        }

        await trx.table("accounts").where("id", accountId).update("balance", balance);
 
        return { balance: balance,  sum: sum, cat: cat };
    }

    async subtractFromCategoryBalance (trx, categoryId, amount)
    {
        let result = await trx.select(
                "groups.id AS groupId",
                "groups.name AS group",
                "cat.id AS categoryId",
                "cat.name AS category",
                "cat.amount AS amount")
            .from("categories AS cat")
            .leftJoin("groups", "groups.id", "cat.group_id")
            .where ("cat.id", categoryId);

        let newAmount = result[0].amount - amount;

        await trx.table("categories").where("id", categoryId).update("amount", newAmount);
        
        return {
            group: {
                id: result[0].groupId,
                name: result[0].group },
            category: {
                id: result[0].categoryId,
                name: result[0].category},
            amount: newAmount
        };
    }

    async sync ({request, auth}) {
        const trx = await Database.beginTransaction ();

        let acct = await trx.select ("access_token AS accessToken", "acct.id AS accountId", "plaid_account_id AS plaidAccountId", "start_date AS startDate", "tracking")
            .from("institutions AS inst")
            .join("accounts AS acct", "acct.institution_id", "inst.id")
            .where ('acct.id', request.params.acctId)
            .where ('user_id', auth.user.id);

        let result = {};
        
        if (acct.length > 0) {
            
            if (acct[0].tracking == "Transactions") {
               
                let details = await this.addTransactions (trx,  acct[0].accessToken, acct[0].accountId, acct[0].plaidAccountId, acct[0].startDate, auth);
                
                if (details.cat) {
                    let systemCats = await trx.select ('cats.id AS id', 'cats.name AS name')
                        .from ('categories AS cats')
                        .join('groups', 'groups.id', 'group_id')
                        .where('cats.system', true)
                        .andWhere ('groups.user_id', auth.user.id);
                    let unassigned = systemCats.find (entry => entry.name == "Unassigned");
                    
                    result.categories = [{id: unassigned.id, amount: details.cat.amount}];
                }
                
                result.accounts = [{ id: request.params.acctId, balance: details.balance}];
            }
            else {
                let balanceResponse = await client.getBalance (acct[0].access_token, {
                    account_ids: [acct[0].plaidAccountId]});
                
                await trx.table("accounts").where("id", request.params.acctId).update("balance", balanceResponse.accounts[0].balances.current);
                
                result.accounts = [{ id: request.params.acctId, balance: balanceResponse.accounts[0].balances.current}];
            }
        }

        await trx.commit ();
        
        return result;
    }
    
    async updateTx ({request, auth}) {
        let trx = await Database.beginTransaction ();

        let result = {categories: []}
        
        let systemCats = await trx.select ('cats.id AS id', 'cats.name AS name')
            .from ('categories AS cats')
            .join('groups', 'groups.id', 'group_id')
            .where('cats.system', true)
            .andWhere ('groups.user_id', auth.user.id);
        let unassigned = systemCats.find (entry => entry.name == "Unassigned");

        let splits = await trx.select("category_id AS categoryId", "amount")
            .from("category_splits")
            .where ("transaction_id", request.params.txId);

        if (splits.length > 0) {
            
            for (let split of splits) {
                let cat = await this.subtractFromCategoryBalance (trx, split.categoryId, split.amount);

                result.categories.push({id: cat.category.id, amount: cat.amount});
            }
            
            await trx.table('category_splits').where ('transaction_id', request.params.txId).delete();
        }
        else {
            // There are no category splits. Debit the "Unassigned" category
            
            let trans = await trx.select("amount").from("transactions").where ("id", request.params.txId);
            
            let cat = await this.subtractFromCategoryBalance (trx, unassigned.id, trans[0].amount);

            result.categories.push({id: cat.category.id, amount: cat.amount});
        }
        
        if (request.body.splits.length > 0) {

            for (let split of request.body.splits) {

                if (split.categoryId !== unassigned.id) {
                    await trx.insert({transaction_id: request.params.txId, category_id: split.categoryId, amount: split.amount}).into('category_splits');
                }
                
                let cat = await this.subtractFromCategoryBalance (trx, split.categoryId, -split.amount);

                // Determine if the category is already in the array.
                const index = result.categories.findIndex(c => c.id === cat.category.id);

                // If the category is already in the array then simply update the amount.
                // Otherwise, add the category and amount to the array.
                if (index !== -1) {
                    result.categories[index].amount = cat.amount;
                }
                else {
                    result.categories.push({id: cat.category.id, amount: cat.amount});
                }
            }
        }
        
        let transCats = await trx.select(
                "category_id as categoryId", "splits.amount AS amount", "cats.name AS category", "groups.name AS group")
            .from ("category_splits AS splits")
            .join ("categories AS cats", "cats.id", "splits.category_id")
            .join ("groups", "groups.id", "cats.group_id")
            .where ("splits.transaction_id", request.params.txId);

        result.splits = null;
        if (transCats.length > 0) {
            result.splits = transCats;
        }

        await trx.commit ();

        return result;
    }

}

module.exports = InstitutionController
