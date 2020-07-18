'use strict'

const moment = require('moment');

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model');
const Database = use('Database');
const plaidClient = use('Plaid');

class Account extends Model {
    accountTransactions() {
        return this.hasMany('App/Models/AccountTransaction');
    }

    balanceHistory() {
        return this.hasMany('App/Models/BalanceHistory');
    }

    institution() {
        return this.belongsTo('App/Models/Institution');
    }

    // eslint-disable-next-line class-methods-use-this
    getBalance(balance) {
        return parseFloat(balance);
    }

    async sync(trx, accessToken, userId) {
        const result = {};

        if (this.tracking === 'Transactions') {
            // Retrieve the past 30 days of transactions
            // (unles the account start date is sooner)
            const startDate = moment.max(
                moment().subtract(30, 'days'),
                moment(this.start_date),
            );

            const details = await this.addTransactions(
                trx,
                accessToken,
                startDate,
                userId,
            );

            await this.updateAccountBalanceHistory(
                trx, details.balance,
            );

            if (details.cat) {
                const systemCats = await trx.select('cats.id AS id', 'cats.name AS name')
                    .from('categories AS cats')
                    .join('groups', 'groups.id', 'group_id')
                    .where('cats.system', true)
                    .andWhere('groups.user_id', userId);
                const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

                result.categories = [{ id: unassigned.id, amount: details.cat.amount }];
            }

            result.accounts = [{ id: this.id, balance: details.balance }];
        }
        else {
            const balanceResponse = await plaidClient.getBalance(accessToken, {
                account_ids: [this.plaid_account_id],
            });

            console.log(JSON.stringify(balanceResponse, null, 4));

            this.balance = balanceResponse.accounts[0].balances.current;
            this.save(trx);

            await this.updateAccountBalanceHistory(
                trx, balanceResponse.accounts[0].balances.current,
            );

            result.accounts = [{
                id: this.id,
                balance: balanceResponse.accounts[0].balances.current,
            }];
        }

        return result;
    }

    async addTransactions(trx, accessToken, startDate, userId) {
        const pendingTransactions = await trx.select('transaction_id', 'plaid_transaction_id')
            .from('account_transactions')
            .where('account_id', this.id)
            .andWhere('pending', true);

        const transactionsResponse = await plaidClient.getTransactions(
            accessToken,
            moment(startDate).format('YYYY-MM-DD'),
            moment().format('YYYY-MM-DD'),
            {
                count: 250,
                offset: 0,
                account_ids: [this.plaid_account_id],
            },
        );

        console.log(JSON.stringify(transactionsResponse, null, 4));

        let sum = 0;
        // let pendingSum = 0;

        await Promise.all(transactionsResponse.transactions.map(async (transaction) => {
            // console.log(JSON.stringify(transaction, null, 4));
            // Only consider non-pending transactions
            // console.log(JSON.stringify(transaction, null, 4));

            // First check to see if the transaction is present. If it is then don't insert it.
            const [{ exists }] = await trx.select(
                Database.raw(`EXISTS (SELECT 1 FROM account_transactions WHERE plaid_transaction_id = '${transaction.transaction_id}') AS exists`),
            );

            if (!exists) {
                // console.log('Insert transaction');

                const id = await trx.insert({
                    date: transaction.date,
                    user_id: userId,
                })
                    .into('transactions')
                    .returning('id');

                // console.log(JSON.stringify(id, null, 4));

                await trx.insert({
                    transaction_id: id[0],
                    plaid_transaction_id: transaction.transaction_id,
                    account_id: this.id,
                    name: transaction.name,
                    amount: -transaction.amount,
                    pending: transaction.pending,
                })
                    .into('account_transactions');

                if (!transaction.pending) {
                    sum += transaction.amount;
                }
            }

            const index = pendingTransactions.findIndex(
                (p) => p.plaid_transaction_id === transaction.transaction_id,
            );

            if (index !== -1) {
                pendingTransactions.splice(index, 1);
            }
        }));

        // Delete any pending transaction in the database that remain in the array
        if (pendingTransactions.length > 0) {
            const transIds = pendingTransactions.map(
                (item) => item.transaction_id,
            );
            await trx.table('account_transactions').whereIn('transaction_id', transIds).delete();
            await trx.table('transactions').whereIn('id', transIds).where('user_id', userId).delete();
        }

        let balance = transactionsResponse.accounts[0].balances.current;

        let cat = null;

        if (sum !== 0) {
            const systemCats = await trx.select('cats.id AS id', 'cats.name AS name')
                .from('categories AS cats')
                .join('groups', 'groups.id', 'group_id')
                .where('cats.system', true)
                .andWhere('groups.user_id', userId);
            const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

            // Add the sum of the transactions to the unassigned category.
            cat = await Account.subtractFromCategoryBalance(trx, unassigned.id, sum);
        }

        if (transactionsResponse.accounts[0].type === 'credit'
            || transactionsResponse.accounts[0].type === 'loan') {
            balance = -balance;
        }

        // console.log(`Balance: ${balance}, Pending: ${pendingSum}`);
        this.balance = balance;
        this.save(trx);

        return { balance, sum, cat };
    }

    static async subtractFromCategoryBalance(trx, categoryId, amount) {
        const result = await trx.select(
            'groups.id AS groupId',
            'groups.name AS group',
            'cat.id AS categoryId',
            'cat.name AS category',
            'cat.amount AS amount',
        )
            .from('categories AS cat')
            .leftJoin('groups', 'groups.id', 'cat.group_id')
            .where('cat.id', categoryId);

        const newAmount = result[0].amount - amount;

        await trx.table('categories').where('id', categoryId).update('amount', newAmount);

        return {
            group: {
                id: result[0].groupId,
                name: result[0].group,
            },
            category: {
                id: result[0].categoryId,
                name: result[0].category,
            },
            amount: newAmount,
        };
    }

    async updateAccountBalanceHistory(trx, balance) {
        const today = moment().format('YYYY-MM-DD');

        const acctBalance = await this.balanceHistory().where('date', today).fetch();

        if (acctBalance.size() === 0) {
            await this.balanceHistory().create({ date: today, balance }, trx);
        }
    }
}

module.exports = Account;
