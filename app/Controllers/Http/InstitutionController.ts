import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import moment from 'moment';
import plaidClient, { PlaidAccount, PlaidInstitution } from '@ioc:Plaid';
import Institution from 'App/Models/Institution';
import Account, { AccountSyncResult } from 'App/Models/Account';
import Category from 'App/Models/Category';
import { UnlinkedAccountProps } from 'Common/ResponseTypes';

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
    const inst = await Institution
      .query()
      .where({ institution_id: institution.institution_id, user_id: user.id }).first();

    let accessToken: string;
    let institutionId: number;

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
      .where({ institution_id: institutionId });

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

    const newAccounts: Account[] = [];

    const trx = await Database.transaction();

    let fundingAmount = 0;
    let unassignedAmount = 0;

    const systemCats = await trx.query().select('cats.id AS id', 'cats.name AS name')
      .from('categories AS cats')
      .join('groups', 'groups.id', 'group_id')
      .where('cats.type', '!=', 'REGULAR')
      .andWhere('groups.user_id', user.id);
    const fundingPool = systemCats.find((entry) => entry.name === 'Funding Pool');
    const unassigned = systemCats.find((entry) => entry.name === 'Unassigned');

    const institution = await Institution.findOrFail(request.params().instId);

    if (institution.accessToken) {
      const accountsInput = request.input('accounts') as UnlinkedAccountProps[];
      // eslint-disable-next-line no-restricted-syntax
      for (const account of accountsInput) {
        // eslint-disable-next-line no-await-in-loop
        const [{ exists }] = await trx.query()
          .select(Database.raw(`EXISTS (SELECT 1 FROM accounts WHERE plaid_account_id = '${account.account_id}') AS exists`));

        if (!exists) {
          const acct = (new Account()).useTransaction(trx);

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

          // eslint-disable-next-line no-await-in-loop
          await acct.save();

          if (acct.tracking === 'Transactions') {
            // eslint-disable-next-line no-await-in-loop
            const details = await acct.addTransactions(
              trx, institution.accessToken, startDate, user,
            );

            if (details.cat) {
              unassignedAmount = details.cat.amount;
            }

            const startingBalance = details.balance + details.sum;

            // Insert the 'starting balance' transaction
            // eslint-disable-next-line no-await-in-loop
            const [transId] = await trx.insertQuery().insert({
              date: startDate.format('YYYY-MM-DD'),
              sort_order: -1,
              user_id: user.id,
            })
              .table('transactions')
              .returning('id');

            // eslint-disable-next-line no-await-in-loop
            await trx.insertQuery()
              .insert({
                transaction_id: transId,
                plaid_transaction_id: null,
                account_id: acct.id,
                name: 'Starting Balance',
                amount: startingBalance,
              })
              .table('account_transactions');

            // eslint-disable-next-line no-await-in-loop
            await trx.insertQuery()
              .insert({
                transaction_id: transId,
                category_id: fundingPool.id,
                amount: startingBalance,
              })
              .table('transaction_categories');

            // eslint-disable-next-line no-await-in-loop
            const category = await Category.findOrFail(fundingPool.id, { client: trx });

            category.amount += startingBalance;

            // eslint-disable-next-line no-await-in-loop
            await category.save();

            fundingAmount = category.amount;
          }

          newAccounts.push(acct);
        }
      }
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
      const institutions = await Institution.query().where('user_id', user.id);

      const result: Array<AccountSyncResult> | null = [];

      await Promise.all(institutions.map(async (institution) => {
        const accounts = await institution.related('accounts').query();

        return Promise.all(accounts.map(async (acct) => (
          acct.sync(institution.accessToken, user)
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
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });
      const account = await Account.findOrFail(request.params().acctId, { client: trx });

      let result: AccountSyncResult | null = null;

      result = await account.sync(
        institution.accessToken, user,
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

    // console.log(JSON.stringify(plaidInstitution, null, 4));

    return plaidInstitution;
  }
}

export default InstitutionController;
