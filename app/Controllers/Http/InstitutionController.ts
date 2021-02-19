import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
import moment from 'moment';
import plaidClient, { PlaidAccount, PlaidInstitution } from '@ioc:Plaid';
import Institution from 'App/Models/Institution';
import Account, { AccountSyncResult } from 'App/Models/Account';

type CategoryBalance = {
  group: {
    id: number,
    name: string,
  },
  category: {
    id: number,
    name: string,
  },
  amount: number,
};

class InstitutionController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { institution, publicToken } = request.only(['institution', 'publicToken']);

    // Check to see if we already have the institution. If not, add it.
    const inst = await Institution.findBy('institution_id', institution.institution_id);

    let accessToken;
    let institutionId;

    if (!inst) {
      const tokenResponse = await plaidClient.exchangePublicToken(publicToken);

      accessToken = tokenResponse.access_token;

      [institutionId] = await Database.insertQuery()
        .insert({
          institution_id: institution.institution_id,
          plaid_item_id: tokenResponse.item_id,
          name: institution.name,
          access_token: accessToken,
          user_id: user.id,
        })
        .table('institutions')
        .returning('id');
    }
    else {
      accessToken = inst.accessToken;
      institutionId = inst.id;
    }

    const result = {
      id: institutionId,
      name: institution.name,
      accounts: await InstitutionController.getAccounts(accessToken, institutionId),
    };

    return result;
  }

  static async getAccounts(
    accessToken: string,
    institutionId: number,
  ): Promise<Array<PlaidAccount>> {
    const { accounts } = await plaidClient.getAccounts(accessToken);

    const existingAccts = await Database.query()
      .select('plaid_account_id')
      .from('accounts')
      .where('institution_id', institutionId);

    existingAccts.forEach((existingAcct) => {
      const index = accounts.findIndex((a) => a.account_id === existingAcct.plaid_account_id);

      if (index !== -1) {
        accounts.splice(index, 1);
      }
    });

    return accounts;
  }

  // eslint-disable-next-line class-methods-use-this
  async get({ request, auth: { user } }: HttpContextContract): Promise<Array<PlaidAccount>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const inst = await Institution.findOrFail(request.params().instId);

    let accounts: Array<PlaidAccount> = [];

    accounts = await InstitutionController
      .getAccounts(inst.accessToken, inst.id);

    return accounts;
  }

  // eslint-disable-next-line class-methods-use-this
  public async addAccounts({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const newAccounts: Array<Account> = [];

    const trx = await Database.transaction();

    let fundingAmount = 0;
    let unassignedAmount = 0;

    const systemCats = await trx.query().select('cats.id AS id', 'cats.name AS name')
      .from('categories AS cats')
      .join('groups', 'groups.id', 'group_id')
      .where('cats.system', true)
      .andWhere('groups.user_id', user.id);
    const fundingPool = systemCats.find((entry) => entry.name === 'Funding Pool');
    const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

    const institution = await Institution.findOrFail(request.params().instId);

    if (institution.accessToken) {
      type AccountInput = {
        // eslint-disable-next-line camelcase
        account_id: string,
        name: string,
        // eslint-disable-next-line camelcase
        official_name: string,
        mask: string,
        type: string,
        subtype: string,
        balances: {
          current: number,
        },
        tracking: string,
      };

      const accountsInput = request.input('accounts') as Array<AccountInput>;
      await Promise.all(accountsInput.map(async (account) => {
        const [{ exists }] = await trx.query()
          .select(Database.raw(`EXISTS (SELECT 1 FROM accounts WHERE plaid_account_id = '${account.account_id}') AS exists`));

        if (!exists) {
          const acct = new Account();

          let startDate = request.input('startDate');
          if (startDate === undefined || startDate === null) {
            startDate = moment().startOf('month');
          }
          else {
            startDate = moment(startDate);
          }

          acct.plaidAccountId = account.account_id;
          acct.name = account.name;
          acct.officialName = account.official_name;
          acct.mask = account.mask;
          acct.subtype = account.subtype;
          acct.type = account.type;
          acct.institutionId = request.params().instId;
          acct.startDate = startDate.format('YYYY-MM-DD');
          acct.balance = account.balances.current;
          acct.tracking = account.tracking;
          acct.enabled = true;

          acct.useTransaction(trx);
          await acct.save();

          if (acct.tracking === 'Transactions') {
            const details = await acct.addTransactions(
              trx, institution.accessToken, startDate, user.id,
            );

            if (details.cat) {
              unassignedAmount = details.cat.amount;
            }

            const startingBalance = details.balance + details.sum;

            // Insert the 'starting balance' transaction
            const [transId] = await trx.insertQuery().insert({
              date: startDate.format('YYYY-MM-DD'),
              sort_order: -1,
              user_id: user.id,
            })
              .table('transactions')
              .returning('id');

            await trx.insertQuery()
              .insert({
                transaction_id: transId,
                plaid_transaction_id: null,
                account_id: acct.id,
                name: 'Starting Balance',
                amount: startingBalance,
              })
              .table('account_transactions');

            await trx.insertQuery()
              .insert({
                transaction_id: transId,
                category_id: fundingPool.id,
                amount: startingBalance,
              })
              .table('transaction_categories');

            const funding = await InstitutionController.subtractFromCategoryBalance(
              trx, fundingPool.id, -startingBalance,
            );

            fundingAmount = funding.amount;
          }

          newAccounts.push(acct);
        }
      }));
    }

    await trx.commit();

    return {
      accounts: newAccounts,
      categories: [
        { id: fundingPool.id, amount: fundingAmount },
        { id: unassigned.id, amount: unassignedAmount },
      ],
    };
  }

  static async subtractFromCategoryBalance(
    trx: TransactionClientContract,
    categoryId: number,
    amount: number,
  ): Promise<CategoryBalance> {
    const result = await trx.query()
      .select(
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

    await trx.from('categories').where('id', categoryId).update('amount', newAmount);

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

  // eslint-disable-next-line class-methods-use-this
  public async syncAll({
    response,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Array<AccountSyncResult> | null> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    try {
      const institutions = await Institution.all();

      const result: Array<AccountSyncResult> | null = [];

      await Promise.all(institutions.map(async (institution) => {
        await institution.preload('accounts');
        const { accounts } = institution;

        return Promise.all(accounts.map(async (acct) => (
          acct.sync(trx, institution.accessToken, user.id)
        )));
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

  // eslint-disable-next-line class-methods-use-this
  public async sync({
    request,
    response,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown> | null> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    try {
      const institution = await Institution.findOrFail(request.params().instId);
      const account = await Account.findOrFail(request.params().acctId);

      let result: AccountSyncResult | null = null;

      result = await account.sync(
        trx, institution.accessToken, user.id,
      );

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

  // eslint-disable-next-line class-methods-use-this
  public async updateTx({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    type CatBalance = {
      id: number,
      balance: number,
    };

    type Result = {
      categories: Array<CatBalance>,
      splits: Array<unknown>,
    };

    const result: Result = {
      categories: [],
      splits: [],
    };

    // Get the 'unassigned' category id
    const systemCats = await trx.query()
      .select('cats.id AS id', 'cats.name AS name')
      .from('categories AS cats')
      .join('groups', 'groups.id', 'group_id')
      .where('cats.system', true)
      .andWhere('groups.user_id', user.id);
    const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

    const splits = await trx.query().select('category_id AS categoryId', 'amount')
      .from('transaction_categories')
      .where('transaction_id', request.params().txId);

    if (splits.length > 0) {
      // There are pre-existing category splits.
      // Credit the category balance for each one.
      await Promise.all(splits.map(async (split) => {
        const cat = await InstitutionController.subtractFromCategoryBalance(
          trx, split.categoryId, split.amount,
        );

        result.categories.push({ id: cat.category.id, balance: cat.amount });
      }));

      await trx.from('transaction_categories').where('transaction_id', request.params().txId).delete();
    }
    else {
      // There are no category splits. Debit the 'Unassigned' category

      const trans = await trx.query()
        .select('amount').from('account_transactions').where('transaction_id', request.params().txId);

      const cat = await InstitutionController
        .subtractFromCategoryBalance(trx, unassigned.id, trans[0].amount);

      result.categories.push({ id: cat.category.id, balance: cat.amount });
    }

    if (request.input('splits').length > 0) {
      await Promise.all(request.input('splits').map(async (split) => {
        if (split.categoryId !== unassigned.id) {
          await trx.insertQuery()
            .insert({
              transaction_id: request.params().txId,
              category_id: split.categoryId,
              amount: split.amount,
            })
            .table('transaction_categories');
        }

        const cat = await InstitutionController.subtractFromCategoryBalance(
          trx, split.categoryId, -split.amount,
        );

        // Determine if the category is already in the array.
        const index = result.categories.findIndex((c) => c.id === cat.category.id);

        // If the category is already in the array then simply update the amount.
        // Otherwise, add the category and amount to the array.
        if (index !== -1) {
          result.categories[index].balance = cat.amount;
        }
        else {
          result.categories.push({ id: cat.category.id, balance: cat.amount });
        }
      }));
    }

    const transCats = await trx.query()
      .select(
        'category_id as categoryId',
        Database.raw('CAST(splits.amount AS float) AS amount'),
        'cats.name AS category',
        'groups.name AS group',
      )
      .from('transaction_categories AS splits')
      .join('categories AS cats', 'cats.id', 'splits.category_id')
      .join('groups', 'groups.id', 'cats.group_id')
      .where('splits.transaction_id', request.params().txId);

    result.splits = [];
    if (transCats.length > 0) {
      result.splits = transCats;
    }

    await trx.commit();

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async linkToken({
    request,
    response,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const institution = await Institution.findOrFail(parseInt(request.params().instId, 10));

    const linkTokenResponse = await plaidClient.createLinkToken({
      user: {
        client_user_id: user.id.toString(),
      },
      client_name: 'debertas',
      country_codes: ['US'],
      language: 'en',
      access_token: institution.accessToken,
    });

    response.json({ linkToken: linkTokenResponse.link_token });
  }

  // eslint-disable-next-line class-methods-use-this
  public async info({ request, auth: { user } }: HttpContextContract): Promise<PlaidInstitution> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const institution = await Institution.findOrFail(request.params().instId);

    const plaidInstitution = institution.getPlaidInstition();

    console.log(JSON.stringify(plaidInstitution, null, 4));

    return plaidInstitution;
  }
}

export default InstitutionController;
