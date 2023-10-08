/* eslint-disable no-await-in-loop */
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
import plaidClient, { PlaidInstitution } from '@ioc:Plaid';
import Institution from 'App/Models/Institution';
import Account, { AccountSyncResult } from 'App/Models/Account';
import Category from 'App/Models/Category';
import {
  AccountProps, AccountType, CategoryBalanceProps,
  InstitutionProps, TrackingType, TransactionType, UnlinkedAccountProps,
} from 'Common/ResponseTypes';
import { schema } from '@ioc:Adonis/Core/Validator';
import Transaction from 'App/Models/Transaction';
import AccountTransaction from 'App/Models/AccountTransaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import { DateTime } from 'luxon';
import BalanceHistory from 'App/Models/BalanceHistory';
import Budget from 'App/Models/Budget';
import { Exception } from '@poppinss/utils';
import { CountryCode, AccountType as PlaidAccountType, Products } from 'plaid';
import Env from '@ioc:Adonis/Core/Env'

type OnlineAccount = {
  plaidAccountId: string,
  name: string,
  officialName?: string | null,
  mask: string,
  type: AccountType,
  subtype: string,
  balances: {
    current: number,
  },
  tracking: string,
};

type OfflineAccount = {
  name: string,
  balance: number,
  type: AccountType,
  subtype: string,
  tracking: string,
  rate?: number | null,
};

type AddAccountsResponse = {
  accounts: AccountProps[],
  categories: CategoryBalanceProps[],
}

class InstitutionController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<InstitutionProps> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const requestData = await request.validate({
      schema: schema.create({
        institution: schema.object().members({
          institutionId: schema.string.optional(),
          name: schema.string(),
        }),
        publicToken: schema.string.optional(),
        accounts: schema.array.optional().members(
          schema.object().members({
            name: schema.string(),
            balance: schema.number(),
            type: schema.enum(Object.values(PlaidAccountType)),
            subtype: schema.string(),
            tracking: schema.string(),
            rate: schema.number.optional(),
          }),
        ),
        startDate: schema.string.optional(),
      }),
    });

    // Check to see if we already have the institution. If not, add it.
    if (requestData.institution.institutionId) {
      let inst = await Institution
        .query()
        .where({ institutionId: requestData.institution.institutionId, budgetId: budget.id })
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
            budgetId: budget.id,
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

    try {
      const inst = await (new Institution())
        .fill({
          name: requestData.institution.name,
          budgetId: budget.id,
        })
        .useTransaction(trx)
        .save();

      if (inst === null) {
        throw new Error('inst is null');
      }

      let accounts: AddAccountsResponse = {
        accounts: [],
        categories: [],
      };

      if (requestData.accounts) {
        accounts = await InstitutionController.addOfflineAccounts(
          budget, inst, requestData.accounts, requestData.startDate, { client: trx },
        );
      }

      await trx.commit();

      return {
        id: inst.id,
        name: inst.name,
        offline: true,
        ...accounts,
      };
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
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
        if (balance !== null && (acct.type === 'credit' || acct.type === 'loan')) {
          balance = -balance;
        }

        return ({
          plaidAccountId: acct.account_id,
          name: acct.name,
          officialName: acct.official_name,
          mask: acct.mask,
          type: acct.type,
          subtype: acct.subtype as string,
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
    budget: Budget,
    acct: Account,
    startDate: DateTime,
    startingBalance: number,
    fundingPool: Category,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<void> {
    const transaction = (new Transaction())
      .fill({
        date: startDate,
        sortOrder: -1,
        budgetId: budget.id,
        type: TransactionType.STARTING_BALANCE,
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

    if (acct.tracking === 'Transactions') {
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
  }

  // eslint-disable-next-line class-methods-use-this
  private static async addOnlineAccounts(
    budget: Budget,
    institution: Institution,
    accounts: OnlineAccount[],
    startDate: string,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<AddAccountsResponse> {
    if (!institution.accessToken) {
      throw new Error('accessToken is not defined');
    }

    const newAccounts: Account[] = [];

    const fundingPool = await budget.getFundingPoolCategory(options);

    // eslint-disable-next-line no-restricted-syntax
    for (const account of accounts) {
      // eslint-disable-next-line no-await-in-loop
      let acct = await Account.findBy('plaidAccountId', account.plaidAccountId, options);

      if (!acct) {
        const start = DateTime.fromISO(startDate);

        acct = (new Account())
          .fill({
            plaidAccountId: account.plaidAccountId,
            name: account.name,
            officialName: account.officialName,
            mask: account.mask,
            subtype: account.subtype,
            type: account.type,
            institutionId: institution.id,
            startDate: start,
            balance: account.balances.current,
            tracking: account.tracking as TrackingType,
            enabled: true,
            closed: false,
          });

        if (options && options.client) {
          acct.useTransaction(options.client);
        }

        // eslint-disable-next-line no-await-in-loop
        await acct.save();

        if (acct.tracking !== 'Balances') {
          // // eslint-disable-next-line no-await-in-loop
          // const sum = await acct.addTransactions(
          //   institution.accessToken, start, budget,
          // );

          // // eslint-disable-next-line no-await-in-loop
          // await acct.save();

          // // Insert the 'starting balance' transaction
          // // eslint-disable-next-line no-await-in-loop
          // await InstitutionController.insertStartingBalance(
          //   budget, acct, start, acct.balance - sum, fundingPool, options,
          // );

          // await plaidClient.getTransactions(
          //   institution.accessToken,
          //   start.toISODate() ?? '',
          //   DateTime.now().toISODate() ?? '',
          //   {
          //     count: 250,
          //     offset: 0,
          //     account_ids: [acct.plaidAccountId],
          //   },
          // );
          // plaidClient.syncTransactions();
        }
        else {
          await acct.updateAccountBalanceHistory(acct.balance);

          acct.syncDate = DateTime.now();

          // eslint-disable-next-line no-await-in-loop
          await acct.save();
        }

        newAccounts.push(acct);
      }
    }

    const unassigned = await budget.getUnassignedCategory(options);

    return {
      accounts: newAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        closed: a.closed,
        type: a.type,
        subtype: a.subtype,
        tracking: a.tracking,
        syncDate: a.syncDate?.toISO() ?? null,
        balance: a.balance,
        plaidBalance: a.plaidBalance,
        rate: a.rate,
      })),
      categories: [
        { id: fundingPool.id, balance: fundingPool.amount },
        { id: unassigned.id, balance: unassigned.amount },
      ],
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private static async addOfflineAccounts(
    budget: Budget,
    institution: Institution,
    accounts: OfflineAccount[],
    startDate: string,
    options?: {
      client: TransactionClientContract,
    },
  ): Promise<AddAccountsResponse> {
    const newAccounts: Account[] = [];

    const fundingPool = await budget.getFundingPoolCategory(options);

    const start = DateTime.fromISO(startDate);

    // eslint-disable-next-line no-restricted-syntax
    for (const account of accounts) {
      const acct = new Account();

      if (options && options.client) {
        acct.useTransaction(options.client);
      }

      acct.fill({
        name: account.name,
        institutionId: institution.id,
        startDate: start,
        balance: account.balance,
        tracking: account.tracking as TrackingType,
        enabled: true,
        type: account.type,
        subtype: account.subtype,
        syncDate: DateTime.now(),
        rate: account.rate,
        closed: false,
      });

      // eslint-disable-next-line no-await-in-loop
      await acct.save();

      if (acct.tracking !== 'Balances') {
        // eslint-disable-next-line no-await-in-loop
        await InstitutionController.insertStartingBalance(
          budget, acct, start, account.balance, fundingPool, options,
        );
      }
      else {
        await acct.updateAccountBalanceHistory(acct.balance);

        // eslint-disable-next-line no-await-in-loop
        await acct.save();
      }

      newAccounts.push(acct);
    }

    return {
      accounts: newAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        closed: a.closed,
        type: a.type,
        subtype: a.subtype,
        tracking: a.tracking,
        syncDate: a.syncDate?.toISO() ?? null,
        balance: a.balance,
        plaidBalance: a.plaidBalance,
        rate: a.rate,
      })),
      categories: [
        { id: fundingPool.id, balance: fundingPool.amount },
      ],
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async addAccounts({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<AddAccountsResponse | void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const requestData = await request.validate({
      schema: schema.create({
        plaidAccounts: schema.array.optional().members(
          schema.object().members({
            plaidAccountId: schema.string(),
            name: schema.string(),
            officialName: schema.string.optional(),
            mask: schema.string(),
            type: schema.enum(Object.values(PlaidAccountType)),
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
            type: schema.enum(Object.values(PlaidAccountType)),
            subtype: schema.string(),
            tracking: schema.string(),
            rate: schema.number.optional(),
          }),
        ),
        startDate: schema.string(),
      }),
    });

    const trx = await Database.transaction();

    try {
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });

      if (requestData.plaidAccounts) {
        await InstitutionController.addOnlineAccounts(
          budget, institution, requestData.plaidAccounts, requestData.startDate, { client: trx },
        );
      }
      else if (requestData.offlineAccounts) {
        await InstitutionController.addOfflineAccounts(
          budget, institution, requestData.offlineAccounts, requestData.startDate, { client: trx },
        );
      }
      else {
        throw new Error('plaidAccounts nor offlineAccounts are defined');
      }

      await trx.commit();

      const trx2 = await Database.transaction();
      institution.useTransaction(trx2);

      try {
        await institution.syncUpdate();

        await trx2.commit();
      }
      catch (error) {
        await trx2.rollback();
        logger.error(error);
      }

      const accounts = await Promise.all((await institution.related('accounts').query()).map((a) => ({
        id: a.id,
        name: a.name,
        closed: a.closed,
        type: a.type,
        subtype: a.subtype,
        tracking: a.tracking,
        syncDate: a.syncDate?.toISO() ?? null,
        balance: a.balance,
        plaidBalance: a.plaidBalance,
        rate: a.rate,
      })));

      const fundingPool = await budget.getFundingPoolCategory();
      const unassigned = await budget.getUnassignedCategory();

      return {
        accounts,
        categories: [
          { id: fundingPool.id, balance: fundingPool.amount },
          { id: unassigned.id, balance: unassigned.amount },
        ],
      };
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async syncAll({
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<(AccountSyncResult | null)[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await Database.transaction();

    try {
      // Get the institutions that have been linked to Plaid.
      const institutions = await Institution.query({ client: trx })
        .where('budgetId', budget.id)
        .whereNotNull('accessToken')
        .andWhere('accessToken', '!=', '');

      const result: AccountSyncResult[] | null = [];

      await Promise.all(institutions.map(async (institution) => (
        await institution.syncUpdate()
      )));

      await trx.commit();

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async sync({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<Record<string, unknown> | null> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    try {
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });

      await institution.syncUpdate();

      await trx.commit();

      return null;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
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

    if (institution.accessToken === null || institution.accessToken === '') {
      throw new Exception(`access token not set for ${institution.plaidItemId}`);
    }

    const appName = Env.get('APP_NAME');
    const webhook = Env.get('PLAID_WEBHOOK');

    const linkTokenResponse = await plaidClient.createLinkToken({
      user: {
        client_user_id: user.id.toString(),
      },
      client_name: appName,
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook,
      products: [Products.Transactions],
      access_token: institution.accessToken,
      link_customization_name: 'account_select',
      update: {
        account_selection_enabled: true,
      },
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

    return plaidInstitution;
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteAccount(
    { request, auth: { user }, logger }: HttpContextContract,
  ): Promise<CategoryBalanceProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await Database.transaction();

    try {
      const account = await Account.findOrFail(request.params().acctId, { client: trx });

      const result = await InstitutionController.deleteAccounts([account], budget, trx);

      await trx.commit();

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  private static async deleteAccounts(
    institution: Institution,
    budget: Budget,
    trx: TransactionClientContract,
  ): Promise<CategoryBalanceProps[]> {
    const categoryBalances: CategoryBalanceProps[] = [];

    const accounts = await institution.related('accounts').query();

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
            if (acct.tracking === 'Transactions') {
              // eslint-disable-next-line no-await-in-loop
              const unassignedCat = await budget.getUnassignedCategory({ client: trx });

              unassignedCat.amount -= acctTran.amount;

              await unassignedCat.save();

              const catBalance = categoryBalances.find((cb) => cb.id === unassignedCat.id);

              if (catBalance) {
                catBalance.balance = unassignedCat.amount;
              }
              else {
                categoryBalances.push({ id: unassignedCat.id, balance: unassignedCat.amount })
              }
            }
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

                const catBalance = categoryBalances.find((cb) => cb.id === category.id);

                if (catBalance) {
                  catBalance.balance = category.amount;
                }
                else {
                  categoryBalances.push({ id: category.id, balance: category.amount })
                }
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

    return categoryBalances;
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete(
    { request, auth: { user }, logger }: HttpContextContract,
  ): Promise<CategoryBalanceProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await Database.transaction();

    try {
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });

      if (institution.accessToken) {
        await plaidClient.removeItem(institution.accessToken);
      }

      // eslint-disable-next-line no-restricted-syntax
      const result = await InstitutionController.deleteAccounts(institution, budget, trx);

      await institution.delete();

      await trx.commit();

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }
}

export default InstitutionController;
