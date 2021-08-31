/* eslint-disable no-await-in-loop */
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
import moment from 'moment';
import plaidClient, { PlaidInstitution } from '@ioc:Plaid';
import Institution from 'App/Models/Institution';
import Account, { AccountSyncResult } from 'App/Models/Account';
import Category from 'App/Models/Category';
import User from 'App/Models/User'
import {
  AccountProps, InstitutionProps, TrackingType, UnlinkedAccountProps,
} from 'Common/ResponseTypes';
import { schema } from '@ioc:Adonis/Core/Validator';
import Transaction from 'App/Models/Transaction';
import AccountTransaction from 'App/Models/AccountTransaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import { DateTime } from 'luxon';
import BalanceHistory from 'App/Models/BalanceHistory';

type OnlineAccount = {
  plaidAccountId: string,
  name: string,
  officialName?: string | null,
  mask: string,
  type: string,
  subtype: string,
  balances: {
    current: number,
  },
  tracking: string,
};

type OfflineAccount = {
  name: string,
  balance: number,
  type: string,
  subtype: string,
  tracking: string,
};

type OnlineAccountsResponse = {
  accounts: AccountProps[],
  categories: {
    id: number,
    amount: number,
  }[],
}

class InstitutionController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<InstitutionProps> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const validationSchema = schema.create({
      institution: schema.object().members({
        institutionId: schema.string.optional(),
        name: schema.string(),
      }),
      publicToken: schema.string.optional(),
      accounts: schema.array.optional().members(
        schema.object().members({
          name: schema.string(),
          balance: schema.number(),
          type: schema.string(),
          subtype: schema.string(),
          tracking: schema.string(),
        }),
      ),
      startDate: schema.string.optional(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    // Check to see if we already have the institution. If not, add it.
    if (requestData.institution.institutionId) {
      let inst = await Institution
        .query()
        .where({ institutionId: requestData.institution.institutionId, userId: user.id })
        .first();

      if (!inst) {
        if (!requestData.publicToken) {
          throw new Error('public token is undefined');
        }

        const tokenResponse = await plaidClient.exchangePublicToken(requestData.publicToken);

        inst = await (new Institution())
          .fill({
            institutionId: requestData.institution.institutionId,
            plaidItemId: tokenResponse.item_id,
            name: requestData.institution.name,
            accessToken: tokenResponse.access_token,
            userId: user.id,
          })
          .save();
      }

      return {
        id: inst.id,
        name: inst.name,
        offline: false,
        accounts: [],
      };
    }

    if (!requestData.startDate) {
      throw new Error('start date is not defined');
    }

    const trx = await Database.transaction();

    const inst = await (new Institution())
      .fill({
        name: requestData.institution.name,
        userId: user.id,
      })
      .useTransaction(trx)
      .save();

    if (inst === null) {
      throw new Error('inst is null');
    }

    let accounts: AccountProps[] = [];

    if (requestData.accounts) {
      const fundingPool = await user.getFundingPoolCategory({ client: trx });

      accounts = await InstitutionController.addOfflineAccounts(
        user, inst, requestData.accounts, requestData.startDate, fundingPool, { client: trx },
      );
    }

    await trx.commit();

    return {
      id: inst.id,
      name: inst.name,
      offline: true,
      accounts,
    };
  }

  static async getUnconnectedAccounts(
    institution: Institution,
  ): Promise<UnlinkedAccountProps[]> {
    if (institution.accessToken) {
      const existingAccts = await Account.query().where('institutionId', institution.id);

      const { accounts } = await plaidClient.getAccounts(institution.accessToken);

      existingAccts.forEach((existingAcct) => {
        const index = accounts.findIndex((a) => a.account_id === existingAcct.plaidAccountId);

        if (index !== -1) {
          accounts.splice(index, 1);
        }
      });

      return accounts.map((acct) => {
        let balance = acct.balances.current;
        if (acct.type === 'credit' || acct.type === 'loan') {
          balance = -balance;
        }

        return ({
          plaidAccountId: acct.account_id,
          name: acct.name,
          officialName: acct.official_name,
          mask: acct.mask,
          type: acct.type,
          subtype: acct.subtype,
          balances: {
            current: balance,
          },
          tracking: 'None',
        });
      });
    }

    return [];
  }

  // eslint-disable-next-line class-methods-use-this
  async get({ request, auth: { user } }: HttpContextContract): Promise<UnlinkedAccountProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const inst = await Institution.findOrFail(request.params().instId);

    const accounts: UnlinkedAccountProps[] = await InstitutionController
      .getUnconnectedAccounts(inst);

    return accounts;
  }

  private static async insertStartingBalance(
    user: User,
    acct: Account,
    startDate: string,
    startingBalance: number,
    fundingPool: Category,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<void> {
    const transaction = (new Transaction())
      .fill({
        date: DateTime.fromISO(startDate),
        sortOrder: -1,
        userId: user.id,
      });

    if (options && options.client) {
      transaction.useTransaction(options.client);
    }

    // eslint-disable-next-line no-await-in-loop
    await transaction.save();

    const transId = transaction.id;

    const acctTransaction = (new AccountTransaction())
      .fill({
        transactionId: transId,
        accountId: acct.id,
        name: 'Starting Balance',
        amount: startingBalance,
      });

    if (options && options.client) {
      acctTransaction.useTransaction(options.client);
    }

    // eslint-disable-next-line no-await-in-loop
    await acctTransaction.save();

    // eslint-disable-next-line no-await-in-loop
    const transactionCategory = (new TransactionCategory())
      .fill({
        transactionId: transId,
        categoryId: fundingPool.id,
        amount: startingBalance,
      });

    if (options && options.client) {
      transactionCategory.useTransaction(options.client);
    }

    // eslint-disable-next-line no-await-in-loop
    await transactionCategory.save();

    fundingPool.amount += startingBalance;

    // eslint-disable-next-line no-await-in-loop
    await fundingPool.save();
  }

  // eslint-disable-next-line class-methods-use-this
  private static async addOnlineAccounts(
    user: User,
    institution: Institution,
    accounts: OnlineAccount[],
    startDate: string,
    fundingPool: Category,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<OnlineAccountsResponse> {
    if (!institution.accessToken) {
      throw new Error('accessToken is not defined');
    }

    const newAccounts: Account[] = [];

    let unassignedAmount = 0;

    const unassigned = await user.getUnassignedCategory(options);

    // eslint-disable-next-line no-restricted-syntax
    for (const account of accounts) {
      // eslint-disable-next-line no-await-in-loop
      let acct = await Account.findBy('plaidAccountId', account.plaidAccountId, options);

      if (!acct) {
        const start = (startDate ? moment(startDate) : moment().startOf('month'));

        acct = (new Account())
          .fill({
            plaidAccountId: account.plaidAccountId,
            name: account.name,
            officialName: account.officialName,
            mask: account.mask,
            subtype: account.subtype,
            type: account.type,
            institutionId: institution.id,
            startDate: start.format('YYYY-MM-DD'),
            balance: account.balances.current,
            tracking: account.tracking as TrackingType,
            enabled: true,
          });

        if (options && options.client) {
          acct.useTransaction(options.client);
        }

        // eslint-disable-next-line no-await-in-loop
        await acct.save();

        if (acct.tracking === 'Transactions') {
          // eslint-disable-next-line no-await-in-loop
          const details = await acct.addTransactions(
            institution.accessToken, start, user, options,
          );

          if (details.cat) {
            unassignedAmount = details.cat.amount;
          }

          const startingBalance = details.balance - details.sum;

          // Insert the 'starting balance' transaction
          // eslint-disable-next-line no-await-in-loop
          await InstitutionController.insertStartingBalance(
            user, acct, start.format('YYYY-MM-DD'), startingBalance, fundingPool, options,
          );
        }

        newAccounts.push(acct);
      }
    }

    return {
      accounts: newAccounts,
      categories: [
        { id: fundingPool.id, amount: fundingPool.amount },
        { id: unassigned.id, amount: unassignedAmount },
      ],
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private static async addOfflineAccounts(
    user: User,
    institution: Institution,
    accounts: OfflineAccount[],
    startDate: string,
    fundingPool: Category,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<AccountProps[]> {
    const newAccounts: Account[] = [];

    const start = (startDate ? moment(startDate) : moment().startOf('month'));

    // eslint-disable-next-line no-restricted-syntax
    for (const account of accounts) {
      const acct = new Account();

      if (options && options.client) {
        acct.useTransaction(options.client);
      }

      acct.fill({
        name: account.name,
        institutionId: institution.id,
        startDate: start.format('YYYY-MM-DD'),
        balance: account.balance,
        tracking: account.tracking as TrackingType,
        enabled: true,
        type: account.type,
        subtype: account.subtype,
      });

      // eslint-disable-next-line no-await-in-loop
      await acct.save();

      // eslint-disable-next-line no-await-in-loop
      await InstitutionController.insertStartingBalance(
        user, acct, start.format('YYYY-MM-DD'), account.balance, fundingPool, options,
      );

      newAccounts.push(acct);
    }

    return newAccounts;
  }

  // eslint-disable-next-line class-methods-use-this
  public async addAccounts({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<AccountProps[] | OnlineAccountsResponse> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const validationSchema = schema.create({
      plaidAccounts: schema.array.optional().members(
        schema.object().members({
          plaidAccountId: schema.string(),
          name: schema.string(),
          officialName: schema.string.optional(),
          mask: schema.string(),
          type: schema.string(),
          subtype: schema.string(),
          balances: schema.object().members({
            current: schema.number(),
          }),
          tracking: schema.string(),
        }),
      ),
      offlineAccounts: schema.array.optional().members(
        schema.object().members({
          name: schema.string(),
          balance: schema.number(),
          type: schema.string(),
          subtype: schema.string(),
          tracking: schema.string(),
        }),
      ),
      startDate: schema.string(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const trx = await Database.transaction();

    const institution = await Institution.findOrFail(request.params().instId, { client: trx });

    const fundingPool = await user.getFundingPoolCategory({ client: trx });

    let result: AccountProps[] | OnlineAccountsResponse;

    if (requestData.plaidAccounts) {
      result = await InstitutionController.addOnlineAccounts(
        user, institution, requestData.plaidAccounts, requestData.startDate, fundingPool, { client: trx },
      );
    }
    else if (requestData.offlineAccounts) {
      result = await InstitutionController.addOfflineAccounts(
        user, institution, requestData.offlineAccounts, requestData.startDate, fundingPool, { client: trx },
      );
    }
    else {
      throw new Error('plaidAccounts nor offlineAccounts are defined');
    }

    await trx.commit();

    return result;
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

  // eslint-disable-next-line class-methods-use-this
  public async deleteAccount(
    { request, auth: { user } }: HttpContextContract,
  ): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    await (await Account.findOrFail(request.params().acctId)).delete();
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete(
    { request, auth: { user } }: HttpContextContract,
  ): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    const accounts = await Account.query({ client: trx }).where('institutionId', request.params().instId);

    // eslint-disable-next-line no-restricted-syntax
    for (const acct of accounts) {
      // eslint-disable-next-line no-await-in-loop
      const acctTrans = await AccountTransaction.query({ client: trx }).where('accountId', acct.id);

      // eslint-disable-next-line no-restricted-syntax
      for (const acctTran of acctTrans) {
        // eslint-disable-next-line no-await-in-loop
        const transaction = await Transaction.find(acctTran.transactionId, { client: trx });

        if (transaction) {
          // eslint-disable-next-line no-await-in-loop
          const transCats = await TransactionCategory
            .query({ client: trx })
            .where('transactionId', transaction.id);

          if (transCats.length === 0) {
            // eslint-disable-next-line no-await-in-loop
            const unassignedCat = await user.getUnassignedCategory({ client: trx });

            unassignedCat.amount -= acctTran.amount;

            await unassignedCat.save();
          }
          else {
            // eslint-disable-next-line no-restricted-syntax
            for (const tc of transCats) {
              // eslint-disable-next-line no-await-in-loop
              const category = await Category.find(tc.categoryId, { client: trx });

              if (category) {
                category.amount -= tc.amount;

                // eslint-disable-next-line no-await-in-loop
                await category.save();
              }

              // eslint-disable-next-line no-await-in-loop
              await tc.delete();
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await acctTran.delete();

          // eslint-disable-next-line no-await-in-loop
          await transaction.delete();
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const balanceHistories = await BalanceHistory.query({ client: trx }).where('accountId', acct.id);

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(balanceHistories.map((balanceHistory) => balanceHistory.delete()));

      // eslint-disable-next-line no-await-in-loop
      await acct.delete();
    }

    await (await Institution.findOrFail(request.params().instId, { client: trx })).delete();

    await trx.commit();
  }
}

export default InstitutionController;
