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
                'inst.id AS institutionId', 
                'inst.name AS institutionName', 
                'acct.id AS accountId', 
                'acct.name AS accountName')
            .table('institutions AS inst')
            .leftJoin ('accounts AS acct',  'acct.institution_id',  'inst.id')
            .where ('inst.user_id', auth.user.id)
            .orderBy('inst.name')
            .orderBy('acct.name');
                
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

    async add({ request, auth }) {
        const { institution, publicToken } = request.only(['institution', 'publicToken']);

        // Check to see if we already have the institution. If not, add it.
        const inst = await Database.table('institutions').where({ institution_id: institution.institution_id, user_id: auth.user.id });

        let accessToken;
        let institutionId;

        if (inst.length === 0) {
            const tokenResponse = await plaidClient.exchangePublicToken(publicToken);

            accessToken = tokenResponse.access_token;

            [institutionId] = await Database.insert({
                institution_id: institution.institution_id,
                name: institution.name,
                access_token: accessToken,
                user_id: auth.user.id,
            })
                .into('institutions')
                .returning('id');
        }
        else {
            accessToken = inst[0].access_token;
            institutionId = inst[0].id;
        }

        const result = {
            id: institutionId,
            name: institution.name
        };

        result.accounts = await this.getAccounts(accessToken, institutionId);

        return result;
    }

    async getAccounts(accessToken, institutionId) {
        const { accounts } = await plaidClient.getAccounts(accessToken);

        const existingAccts = await Database.select('plaid_account_id').from('accounts').where('institution_id', institutionId);

        existingAccts.forEach((existingAcct) => {
            const index = accounts.findIndex((a) => a.account_id === existingAcct.plaid_account_id);

            if (index !== -1) {
                accounts.splice(index, 1);
            }
        });

        return accounts;
    }

    async get({ request, auth }) {
        const inst = await Database.select('access_token').from('institutions').where({ id: request.params.instId, user_id: auth.user.id });

        let accounts = [];
        if (inst.length > 0) {
            accounts = await this.getAccounts(inst[0].access_token, request.params.instId);
        }

        return accounts;
    }

    async addAccounts({ request, auth }) {
        const trx = await Database.beginTransaction();

        let fundingAmount = 0;
        let unassignedAmount = 0;

        const systemCats = await trx.select('cats.id AS id', 'cats.name AS name')
            .from('categories AS cats')
            .join('groups', 'groups.id', 'group_id')
            .where('cats.system', true)
            .andWhere('groups.user_id', auth.user.id);
        const fundingPool = systemCats.find((entry) => entry.name === 'Funding Pool');
        const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

        const inst = await trx.select('access_token').from('institutions').where({ id: request.params.instId, user_id: auth.user.id });

        if (inst.length > 0) {
            await Promise.all(request.body.accounts.map(async (account) => {
                const exists = await trx.select(Database.raw(`EXISTS (SELECT 1 FROM accounts WHERE plaid_account_id = '${account.account_id}') AS exists`));

                if (!exists[0].exists) {
                    const acctId = await trx.insert({
                        plaid_account_id: account.account_id,
                        name: account.name,
                        official_name: account.official_name,
                        mask: account.mask,
                        subtype: account.subtype,
                        type: account.type,
                        institution_id: request.params.instId,
                        start_date: request.body.startDate,
                        balance: account.balances.current,
                        tracking: account.tracking,
                        enabled: true,
                    })
                        .into('accounts').returning('id');

                    if (account.tracking === 'Transactions') {
                        const details = await this.addTransactions(
                            trx, inst[0].access_token, acctId[0], account.account_id,
                            request.body.startDate, auth,
                        );

                        if (details.cat) {
                            unassignedAmount = details.cat.amount;
                        }

                        const startingBalance = details.balance + details.sum;

                        // Insert the 'starting balance' transaction
                        const transId = trx.insert({
                            date: request.body.startDate,
                            sort_order: -1,
                        })
                            .into('transactions')
                            .returning('id');

                        await trx.insert({
                            transaction_id: transId[0],
                            plaid_transaction_id: null,
                            account_id: acctId[0],
                            name: 'Starting Balance',
                            amount: startingBalance,
                        })
                            .into('transactions');

                        await trx.insert({
                            transaction_id: transId[0],
                            category_id: fundingPool.id,
                            amount: startingBalance,
                        })
                            .into('transaction_categories');

                        const funding = await this.subtractFromCategoryBalance(
                            trx, fundingPool.id, -startingBalance,
                        );

                        fundingAmount = funding.amount;
                    }
                }
            }));
        }

        await trx.commit();

        const accounts = await this.getConnectedAccounts(auth);

        return {
            accounts,
            categories: [
                { id: fundingPool.id, amount: fundingAmount },
                { id: unassigned.id, amount: unassignedAmount },
            ],
        };
    }

    async addTransactions(trx, accessToken, accountId, plaidAccountId, startDate, auth) {
        const transactionsResponse = await plaidClient.getTransactions(
            accessToken,
            moment(startDate).format('YYYY-MM-DD'),
            moment().format('YYYY-MM-DD'),
            {
                count: 250,
                offset: 0,
                account_ids: [plaidAccountId],
            },
        );

        // console.log(JSON.stringify(transactionsResponse, null, 4));

        let sum = 0;
        let pendingSum = 0;

        await Promise.all(transactionsResponse.transactions.map(async (transaction) => {
            // console.log(JSON.stringify(transaction, null, 4));
            // Only consider non-pending transactions
            if (!transaction.pending) {
                // console.log(JSON.stringify(transaction, null, 4));

                // First check to see if the transaction is present. If it is then don't insert it.
                const exists = await trx.select(
                    Database.raw(`EXISTS (SELECT 1 FROM account_transactions WHERE plaid_transaction_id = '${transaction.transaction_id}') AS exists`),
                );

                if (!exists[0].exists) {
                    // console.log('Insert transaction');

                    const id = await trx.insert({
                        date: transaction.date,
                    })
                        .into('transactions')
                        .returning('id');

                    // console.log(JSON.stringify(id, null, 4));

                    await trx.insert({
                        transaction_id: id[0],
                        plaid_transaction_id: transaction.transaction_id,
                        account_id: accountId,
                        name: transaction.name,
                        amount: -transaction.amount,
                    })
                        .into('account_transactions');

                    sum += transaction.amount;
                }
            }
            else {
                console.log(JSON.stringify(transaction, null, 4));
                pendingSum += transaction.amount;
            }
        }));

        let balance = transactionsResponse.accounts[0].balances.current;

        let cat = null;

        if (sum !== 0) {
            const systemCats = await trx.select('cats.id AS id', 'cats.name AS name')
                .from('categories AS cats')
                .join('groups', 'groups.id', 'group_id')
                .where('cats.system', true)
                .andWhere('groups.user_id', auth.user.id);
            const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

            // Add the sum of the transactions to the unassigned category.
            cat = await this.subtractFromCategoryBalance(trx, unassigned.id, sum);
        }

        if (transactionsResponse.accounts[0].type === 'credit'
            || transactionsResponse.accounts[0].type === 'loan') {
            balance = -balance;
        }

        await trx.table('accounts').where('id', accountId).update('balance', balance);

        return { balance, sum, cat };
    }

    async subtractFromCategoryBalance (trx, categoryId, amount)
    {
        let result = await trx.select(
                'groups.id AS groupId',
                'groups.name AS group',
                'cat.id AS categoryId',
                'cat.name AS category',
                'cat.amount AS amount')
            .from('categories AS cat')
            .leftJoin('groups', 'groups.id', 'cat.group_id')
            .where ('cat.id', categoryId);

        let newAmount = result[0].amount - amount;

        await trx.table('categories').where('id', categoryId).update('amount', newAmount);
        
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

    static async updateAccountBalanceHistory(trx, accountId, balance) {
        const today = moment().format('YYYY-MM-DD');
        const exists = await trx.select(Database.raw(`EXISTS (SELECT 1 FROM balance_histories WHERE account_id = '${accountId}' AND date = '${today}') AS exists`));

        if (!exists[0].exists) {
            await trx.insert({
                date: today,
                account_id: accountId,
                balance,
            })
                .into('balance_histories');
        }
    }

    async sync({ request, auth }) {
        const trx = await Database.beginTransaction();

        const acct = await trx.select(
            'access_token AS accessToken',
            'acct.id AS accountId',
            'plaid_account_id AS plaidAccountId',
            'start_date AS startDate',
            'tracking',
        )
            .from('institutions AS inst')
            .join('accounts AS acct', 'acct.institution_id', 'inst.id')
            .where('acct.id', request.params.acctId)
            .where('user_id', auth.user.id);

        const result = {};

        if (acct.length > 0) {
            if (acct[0].tracking === 'Transactions') {
                const details = await this.addTransactions(
                    trx,
                    acct[0].accessToken,
                    acct[0].accountId,
                    acct[0].plaidAccountId,
                    acct[0].startDate,
                    auth,
                );

                await InstitutionController.updateAccountBalanceHistory(
                    trx, acct[0].accountId, details.balance,
                );

                if (details.cat) {
                    const systemCats = await trx.select('cats.id AS id', 'cats.name AS name')
                        .from('categories AS cats')
                        .join('groups', 'groups.id', 'group_id')
                        .where('cats.system', true)
                        .andWhere('groups.user_id', auth.user.id);
                    const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

                    result.categories = [{ id: unassigned.id, amount: details.cat.amount }];
                }

                result.accounts = [{ id: request.params.acctId, balance: details.balance }];
            }
            else {
                const balanceResponse = await plaidClient.getBalance(acct[0].accessToken, {
                    account_ids: [acct[0].plaidAccountId],
                });

                await trx.table('accounts').where('id', request.params.acctId).update('balance', balanceResponse.accounts[0].balances.current);

                await InstitutionController.updateAccountBalanceHistory(
                    trx, acct[0].accountId, balanceResponse.accounts[0].balances.current,
                );

                result.accounts = [{
                    id: request.params.acctId,
                    balance: balanceResponse.accounts[0].balances.current,
                }];
            }
        }

        await trx.commit();

        return result;
    }

    async updateTx({ request, auth }) {
        const trx = await Database.beginTransaction();

        const result = { categories: [] };

        // Get the 'unassigned' category id
        const systemCats = await trx.select('cats.id AS id', 'cats.name AS name')
            .from('categories AS cats')
            .join('groups', 'groups.id', 'group_id')
            .where('cats.system', true)
            .andWhere('groups.user_id', auth.user.id);
        const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

        const splits = await trx.select('category_id AS categoryId', 'amount')
            .from('transaction_categories')
            .where('transaction_id', request.params.txId);

        if (splits.length > 0) {
            // There are pre-existing category splits.
            // Credit the category balance for each one.
            await Promise.all(splits.map(async (split) => {
                const cat = await this.subtractFromCategoryBalance(
                    trx, split.categoryId, split.amount,
                );

                result.categories.push({ id: cat.category.id, amount: cat.amount });
            }));

            await trx.table('transaction_categories').where('transaction_id', request.params.txId).delete();
        }
        else {
            // There are no category splits. Debit the 'Unassigned' category

            const trans = await trx.select('amount').from('account_transactions').where('transaction_id', request.params.txId);

            const cat = await this.subtractFromCategoryBalance(trx, unassigned.id, trans[0].amount);

            result.categories.push({ id: cat.category.id, amount: cat.amount });
        }

        if (request.body.splits.length > 0) {
            await Promise.all(request.body.splits.map(async (split) => {
                if (split.categoryId !== unassigned.id) {
                    await trx.insert({
                        transaction_id: request.params.txId,
                        category_id: split.categoryId,
                        amount: split.amount,
                    })
                        .into('transaction_categories');
                }

                const cat = await this.subtractFromCategoryBalance(
                    trx, split.categoryId, -split.amount,
                );

                // Determine if the category is already in the array.
                const index = result.categories.findIndex((c) => c.id === cat.category.id);

                // If the category is already in the array then simply update the amount.
                // Otherwise, add the category and amount to the array.
                if (index !== -1) {
                    result.categories[index].amount = cat.amount;
                }
                else {
                    result.categories.push({ id: cat.category.id, amount: cat.amount });
                }
            }));
        }

        const transCats = await trx.select(
            'category_id as categoryId',
            Database.raw('CAST(splits.amount AS float) AS amount'),
            'cats.name AS category',
            'groups.name AS group',
        )
            .from('transaction_categories AS splits')
            .join('categories AS cats', 'cats.id', 'splits.category_id')
            .join('groups', 'groups.id', 'cats.group_id')
            .where('splits.transaction_id', request.params.txId);

        result.splits = null;
        if (transCats.length > 0) {
            result.splits = transCats;
        }

        await trx.commit();

        return result;
    }

    static async publicToken({ request, auth }) {
        const acct = await Database.select('access_token AS accessToken')
            .from('institutions AS inst')
            .where('inst.id', request.params.instId)
            .andWhere('inst.user_id', auth.user.id);

        console.log (acct);
        const result = await plaidClient.createPublicToken(acct[0].accessToken);

        return { publicToken: result.public_token };
    }
}

module.exports = InstitutionController
