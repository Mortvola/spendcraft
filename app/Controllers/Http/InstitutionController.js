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
    {version: '2019-05-29', clientApp: 'Plaid Quickstart'}
  );


class InstitutionController {
    
    async all () {
        return await this.getConnectedAccounts ();
    }

    async getConnectedAccounts () {
        // Check to see if we already have the institution. If not, add it.
        let result = await Database.select(
                "inst.id AS institutionId", 
                "inst.name AS institutionName", 
                "acct.id AS accountId", 
                "acct.name AS accountName")
            .table("institutions AS inst")
            .leftJoin ("accounts AS acct",  "acct.institution_id",  "inst.id")
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

    async add ({request}) {

        let {institution, publicToken} = request.only (['institution', 'publicToken']);
        
        // Check to see if we already have the institution. If not, add it.
        let inst = await Database.table('institutions').where ('institution_id', institution.institution_id);

        let accessToken;
        let institutionId;
        
        if (inst.length === 0) {
            
            let tokenResponse = await plaidClient.exchangePublicToken(publicToken);
            
            accessToken = tokenResponse.access_token;

            let instId = await Database.insert({ institution_id: institution.institution_id, name: institution.name, access_token: accessToken }).into('institutions').returning('id'); 
            
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
        
        console.log(JSON.stringify(accountsResponse, null, 4));
        
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
    
    async get ({request}) {

        let inst = await Database.select('access_token').from('institutions').where ('id', request.params.instId);

        let accounts = []; 
        if (inst.length > 0) {
            accounts = await this.getAccounts (inst[0].access_token, request.params.instId);
        }

        return accounts;
    }
    
    async addAccounts ({request}) {
        const trx = await Database.beginTransaction ();
        
        let inst = await trx.select ("access_token").from("institutions").where ("id", request.params.instId);
        
        let fundingAmount = 0;
        let unassignedAmount = 0;

        if (inst.length > 0) {
            for (let account of request.body.accounts) {
                
                let exists = await trx.select (Database.raw("EXISTS (SELECT 1 FROM accounts WHERE plaid_account_id = '" + account.account_id + "') AS exists"));
                
                if (!exists[0].exists) {
                    let acctId = await trx.insert(
                        { plaid_account_id: account.account_id, name: account.name, official_name: account.official_name, mask: account.mask,
                          subtype: account.subtype, type: account.type, institution_id: request.params.instId, 
                          start_date: request.body.startDate, balance: account.balances.current, tracking: account.tracking, enabled: true}).into('accounts').returning('id');
                    
                    if (account.tracking == "Transactions") {
                        
                        let details = await this.addTransactions (trx, inst[0].access_token, acctId[0], account.account_id, request.body.startDate);

                        if (details.cat) {
                            unassignedAmount = details.cat.amount;
                        }
                        
                        let startingBalance = details.balance + details.sum;
                        
                        // Insert the "starting balance" transaction
                        let transId = await trx.insert(
                            {transaction_id: null, account_id: acctId[0], name: 'Starting Balance', date: request.body.startDate,
                             amount: startingBalance, sort_order: -1}).into ('transactions').returning('id');
                        
                        await trx.insert(
                            { transaction_id: transId[0], category_id: -1, amount: startingBalance }).into('category_splits');
                        
                        let funding = await this.subtractFromCategoryBalance (trx, -1, -startingBalance);
                        
                        fundingAmount = funding.amount;
                    }
                }
            }
        }

        await trx.commit ();
        
        let accounts = await this.getConnectedAccounts ();
        
        return {accounts: accounts, categories: [{id: -1, amount: fundingAmount}, {id: -2, amount: unassignedAmount}]};
    }
    
    async addTransactions (trx, accessToken, accountId, extAccountId, startDate)
    {
        var startDate = moment(startDate).format('YYYY-MM-DD');
        var endDate = moment().format('YYYY-MM-DD');
        
        let transactionsResponse = await plaidClient.getTransactions(accessToken, startDate, endDate, {
            count: 250,
            offset: 0,
            account_ids: [extAccountId]
        });

//        console.log(JSON.stringify(transactionsResponse.accounts[0], null, 4));

        let sum = 0;
        let pendingSum = 0;
        
        for (let transaction of transactionsResponse.transactions) {

//            console.log(JSON.stringify (transaction, null, 4));

            // Only consider non-pending transactions
            if (!transaction.pending) {
//                console.log(transaction.transaction_id);

                // First check to see if the transaction is present. If it is then don't insert it.
                let exists = await trx.select(Database.raw("EXISTS (SELECT 1 FROM transactions WHERE transaction_id = '" + transaction.transaction_id + "') AS exists"));
                
                if (!exists[0].exists) {
                    
                    console.log(JSON.stringify (transaction, null, 4));
                    
                    await trx.insert({transaction_id: transaction.transaction_id, account_id: accountId,
                          name: transaction.name, date: transaction.date, amount: -transaction.amount}).into('transactions');
                      
                    sum += transaction.amount;
                }
            }
            else {
                console.log(JSON.stringify (transaction, null, 4));

                pendingSum += transaction.amount;
            }
        }
        
        let balance = transactionsResponse.accounts[0].balances.current;
        
        console.log (JSON.stringify(transactionsResponse.accounts[0].balances, null, 4));
        console.log ("balance: " + balance + ", sum: " + sum + ", pending sum: " + pendingSum);
        
        let cat = null;
        
        if (sum != 0) {
            // Add the sum of the transactions to the unassigned category.
            cat = await this.subtractFromCategoryBalance (trx, -2, sum);
        }

        if (transactionsResponse.accounts[0].type == "credit" ||
            transactionsResponse.accounts[0].type == "loan") {
            
            balance = -balance;
        }

        console.log("Account id: " + accountId);
        
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

}

module.exports = InstitutionController
