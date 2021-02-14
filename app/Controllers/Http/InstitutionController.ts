import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
import moment from 'moment';
import plaidClient, { PlaidAccount, PlaidInstitution } from '@ioc:Plaid';
import Institution from 'App/Models/Institution';
import User from 'App/Models/User';
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
    const inst = await Database.from('institutions').where({ institution_id: institution.institution_id, user_id: user.id });

    let accessToken;
    let institutionId;

    if (inst.length === 0) {
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
      accessToken = inst[0].access_token;
      institutionId = inst[0].id;
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
      .select('plaid_account_id').from('accounts').where('institution_id', institutionId);

    existingAccts.forEach((existingAcct) => {
      const index = accounts.findIndex((a) => a.account_id === existingAcct.plaid_account_id);

      if (index !== -1) {
        accounts.splice(index, 1);
      }
    });

    return accounts;
  }

  static async get({ request, auth: { user } }: HttpContextContract): Promise<Array<PlaidAccount>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const inst = await Database.query()
      .select('access_token').from('institutions').where({ id: request.params().instId, user_id: user.id });

    let accounts: Array<PlaidAccount> = [];
    if (inst.length > 0) {
      accounts = await InstitutionController
        .getAccounts(inst[0].access_token, request.params().instId);
    }

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

    const [{ accessToken }] = await trx.query().select('access_token AS accessToken')
      .from('institutions')
      .where({ id: request.params().instId, user_id: user.id });

    if (accessToken) {
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
            startDate = moment().startOf('month').format('YYYY-MM-DD');
          }

          acct.fill({
            plaidAccountId: account.account_id,
            name: account.name,
            officialName: account.official_name,
            mask: account.mask,
            subtype: account.subtype,
            type: account.type,
            institutionId: request.params().instId,
            startDate,
            balance: account.balances.current,
            tracking: account.tracking,
            enabled: true,
          });

          await trx.commit();

          if (acct.tracking === 'Transactions') {
            const details = await acct.addTransactions(
              trx, accessToken, startDate, user.id,
            );

            if (details.cat) {
              unassignedAmount = details.cat.amount;
            }

            const startingBalance = details.balance + details.sum;

            // Insert the 'starting balance' transaction
            const [transId] = await trx.insertQuery().insert({
              date: startDate,
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
        }
      }));
    }

    await trx.commit();

    const accounts = await user.getConnectedAccounts();

    return {
      accounts,
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

      let result: AccountSyncResult | null = null;

      await institution.preload('accounts');
      const { accounts } = institution;
      if (accounts.length > 0) {
        result = await accounts[0].sync(
          trx, institution.accessToken, user.id,
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
      amount: number,
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

        result.categories.push({ id: cat.category.id, amount: cat.amount });
      }));

      await trx.from('transaction_categories').where('transaction_id', request.params().txId).delete();
    }
    else {
      // There are no category splits. Debit the 'Unassigned' category

      const trans = await trx.query()
        .select('amount').from('account_transactions').where('transaction_id', request.params().txId);

      const cat = await InstitutionController
        .subtractFromCategoryBalance(trx, unassigned.id, trans[0].amount);

      result.categories.push({ id: cat.category.id, amount: cat.amount });
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
          result.categories[index].amount = cat.amount;
        }
        else {
          result.categories.push({ id: cat.category.id, amount: cat.amount });
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

    const acct = await Database.query()
      .select('access_token AS accessToken')
      .from('institutions AS inst')
      .where('inst.id', request.params().instId)
      .andWhere('inst.user_id', user.id);

    const linkTokenResponse = await plaidClient.createLinkToken({
      user: {
        client_user_id: user.id.toString(),
      },
      client_name: 'debertas',
      country_codes: ['US'],
      language: 'en',
      access_token: acct[0].accessToken,
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
