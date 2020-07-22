'use strict'

const moment = require('moment');

const Database = use('Database');
const plaidClient = use('Plaid');
const Institution = use('App/Models/Institution');
const Account = use('App/Models/Account');

class InstitutionController {
    static async all({ auth }) {
        return InstitutionController.getConnectedAccounts(auth);
    }

    static async getConnectedAccounts(auth) {
        // Check to see if we already have the institution. If not, add it.
        const result = await Database.select(
            'inst.id AS institutionId',
            'inst.name AS institutionName',
            'acct.id AS accountId',
            'acct.name AS accountName',
            'acct.tracking AS tracking',
        )
            .table('institutions AS inst')
            .leftJoin('accounts AS acct', 'acct.institution_id', 'inst.id')
            .where('inst.user_id', auth.user.id)
            .orderBy('inst.name')
            .orderBy('acct.name');

        const institutions = [];
        let institution = null;

        result.forEach((acct) => {
            if (!institution) {
                institution = { id: acct.institutionId, name: acct.institutionName, accounts: [] };
            }
            else if (institution.name !== acct.institutionName) {
                institutions.push(institution);
                institution = { id: acct.institutionId, name: acct.institutionName, accounts: [] };
            }

            if (acct.accountId) {
                institution.accounts.push({
                    id: acct.accountId,
                    name: acct.accountName,
                    tracking: acct.tracking,
                });
            }
        });

        if (institution) {
            institutions.push(institution);
        }

        return institutions;
    }

    static async add({ request, auth }) {
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
                plaid_item_id: tokenResponse.item_id,
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
            name: institution.name,
        };

        result.accounts = await InstitutionController.getAccounts(accessToken, institutionId);

        return result;
    }

    static async getAccounts(accessToken, institutionId) {
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

    static async get({ request, auth }) {
        const inst = await Database.select('access_token').from('institutions').where({ id: request.params.instId, user_id: auth.user.id });

        let accounts = [];
        if (inst.length > 0) {
            accounts = await InstitutionController
                .getAccounts(inst[0].access_token, request.params.instId);
        }

        return accounts;
    }

    static async addAccounts({ request, auth }) {
        const trx = await Database.beginTransaction();

        let { startDate } = request.body;
        if (startDate === undefined || startDate === null) {
            startDate = moment().startOf('month').format('YYYY-MM-DD');
        }

        let fundingAmount = 0;
        let unassignedAmount = 0;

        const systemCats = await trx.select('cats.id AS id', 'cats.name AS name')
            .from('categories AS cats')
            .join('groups', 'groups.id', 'group_id')
            .where('cats.system', true)
            .andWhere('groups.user_id', auth.user.id);
        const fundingPool = systemCats.find((entry) => entry.name === 'Funding Pool');
        const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

        const [{ accessToken }] = await trx.select('access_token AS accessToken')
            .from('institutions')
            .where({ id: request.params.instId, user_id: auth.user.id });

        if (accessToken) {
            await Promise.all(request.body.accounts.map(async (account) => {
                const [{ exists }] = await trx.select(Database.raw(`EXISTS (SELECT 1 FROM accounts WHERE plaid_account_id = '${account.account_id}') AS exists`));

                if (!exists) {
                    const acct = new Account();

                    acct.fill({
                        plaid_account_id: account.account_id,
                        name: account.name,
                        official_name: account.official_name,
                        mask: account.mask,
                        subtype: account.subtype,
                        type: account.type,
                        institution_id: request.params.instId,
                        start_date: startDate,
                        balance: account.balances.current,
                        tracking: account.tracking,
                        enabled: true,
                    });

                    acct.save(trx);

                    if (acct.tracking === 'Transactions') {
                        const details = await acct.addTransactions(
                            trx, accessToken, startDate, auth.user.id,
                        );

                        if (details.cat) {
                            unassignedAmount = details.cat.amount;
                        }

                        const startingBalance = details.balance + details.sum;

                        // Insert the 'starting balance' transaction
                        const [transId] = await trx.insert({
                            date: startDate,
                            sort_order: -1,
                            user_id: auth.user.id,
                        })
                            .into('transactions')
                            .returning('id');

                        await trx.insert({
                            transaction_id: transId,
                            plaid_transaction_id: null,
                            account_id: acct.id,
                            name: 'Starting Balance',
                            amount: startingBalance,
                        })
                            .into('account_transactions');

                        await trx.insert({
                            transaction_id: transId,
                            category_id: fundingPool.id,
                            amount: startingBalance,
                        })
                            .into('transaction_categories');

                        const funding = await InstitutionController.subtractFromCategoryBalance(
                            trx, fundingPool.id, -startingBalance,
                        );

                        fundingAmount = funding.amount;
                    }
                }
            }));
        }

        await trx.commit();

        const accounts = await InstitutionController.getConnectedAccounts(auth);

        return {
            accounts,
            categories: [
                { id: fundingPool.id, amount: fundingAmount },
                { id: unassigned.id, amount: unassignedAmount },
            ],
        };
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

    static async syncAll({ response, auth }) {
        const trx = await Database.beginTransaction();

        try {
            const institutions = await Institution
                .query()
                .where('user_id', auth.user.id)
                .with('accounts')
                .fetch();

            const result = [];

            await Promise.all(institutions.rows.map(async (institution) => {
                const accounts = institution.getRelated('accounts');

                result.push(await Promise.all(accounts.rows.map(async (acct) => (
                    acct.sync(trx, institution.access_token, auth.user.id)
                ))));
            }));

            await trx.commit();

            return result;
        }
        catch (error) {
            console.log(error);
            await trx.rollback();
            response.internalServerError(error);
            return null;
        }
    }

    static async sync({ request: { params: { instId, acctId } }, response, auth }) {
        const trx = await Database.beginTransaction();

        try {
            const institutions = await Institution
                .query()
                .where('id', instId)
                .where('user_id', auth.user.id)
                .with('accounts', (builder) => {
                    builder.where('id', acctId);
                })
                .fetch();

            let result = {};

            const accounts = institutions.first().getRelated('accounts');
            if (institutions.size() > 0 && accounts.size() > 0) {
                result = await accounts.first().sync(
                    trx, institutions.first().access_token, auth.user.id,
                );
            }

            await trx.commit();

            return result;
        }
        catch (error) {
            console.log(error);
            await trx.rollback();
            response.internalServerError(error);
            return null;
        }
    }

    static async updateTx({ request, auth }) {
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
                const cat = await InstitutionController.subtractFromCategoryBalance(
                    trx, split.categoryId, split.amount,
                );

                result.categories.push({ id: cat.category.id, amount: cat.amount });
            }));

            await trx.table('transaction_categories').where('transaction_id', request.params.txId).delete();
        }
        else {
            // There are no category splits. Debit the 'Unassigned' category

            const trans = await trx.select('amount').from('account_transactions').where('transaction_id', request.params.txId);

            const cat = await InstitutionController
                .subtractFromCategoryBalance(trx, unassigned.id, trans[0].amount);

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

                const cat = await InstitutionController.subtractFromCategoryBalance(
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

        console.log(acct);
        const result = await plaidClient.createPublicToken(acct[0].accessToken);

        return { publicToken: result.public_token };
    }

    static async info({ request, auth }) {
        const [institution] = await Database.select('institution_id')
            .from('institutions AS inst')
            .where('inst.id', request.params.instId)
            .andWhere('inst.user_id', auth.user.id);

        const response = await plaidClient.getInstitutionById(institution.institution_id, {
            include_optional_metadata: true,
            include_status: true,
        });

        console.log(JSON.stringify(response, null, 4));

        return response.institution;
    }
}

module.exports = InstitutionController;
