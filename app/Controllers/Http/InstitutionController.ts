/* eslint-disable no-await-in-loop */
import { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import Institution from '#app/Models/Institution';
import Account, { AccountSyncResult } from '#app/Models/Account';
import Category from '#app/Models/Category';
import {
  AddInstitutionResponse, AddOfflineAccountResponse, AddOnlineAccountsResponse, ApiResponse, CategoryBalanceProps,
  InstitutionProps, InstitutionSyncResponse, TrackingType, UnlinkedAccountProps,
} from '#common/ResponseTypes';
import { schema } from '@adonisjs/validator';
import Transaction from '#app/Models/Transaction';
import AccountTransaction from '#app/Models/AccountTransaction';
import { DateTime } from 'luxon';
import BalanceHistory from '#app/Models/BalanceHistory';
import Budget from '#app/Models/Budget';
import { Exception } from '@adonisjs/core/exceptions';
import * as Plaid from 'plaid';
import env from '#start/env'
import app from '@adonisjs/core/services/app';

class InstitutionController {
  // eslint-disable-next-line class-methods-use-this
  public async add(context: HttpContext): Promise<ApiResponse<AddInstitutionResponse>> {
    const { request } = context;

    const checkData = await request.validate({
      schema: schema.create({
        publicToken: schema.string.optional(),
      }),
    });

    if (!checkData.publicToken) {
      return this.addOffline(context)
    }

    const {
      auth: {
        user,
      },
      logger,
    } = context;

    if (!user) {
      throw new Error('user is not defined');
    }
    const budget = await user.related('budget').query().firstOrFail();

    const requestData = await request.validate({
      schema: schema.create({
        publicToken: schema.string(),
        institutionId: schema.string(),
      }),
    });

    if (!requestData.publicToken) {
      throw new Error('public token is undefined');
    }

    const trx = await db.transaction();

    let tokenResponse: Plaid.ItemPublicTokenExchangeResponse | null = null;
    let institutionResponse: Plaid.InstitutionsGetByIdResponse | null = null;

    const plaidClient = await app.container.make('plaid')

    try {
      tokenResponse = await plaidClient.exchangePublicToken(requestData.publicToken);

      institutionResponse = await plaidClient
        .getInstitutionById(requestData.institutionId, [Plaid.CountryCode.Us]);

      const institution = await new Institution()
        .useTransaction(trx)
        .fill({
          institutionId: institutionResponse.institution.institution_id,
          name: institutionResponse.institution.name,
          plaidItemId: tokenResponse.item_id,
          accessToken: tokenResponse.access_token,
          budgetId: budget.id,
        })
        .save();

      const accountsResponse = await InstitutionController.addOnlineAccounts(
        budget, institution,
      );

      await trx.commit();

      const trx2 = await db.transaction();
      institution.useTransaction(trx2);

      try {
        await institution.syncUpdate();

        await trx2.commit();
      }
      catch (error) {
        await trx2.rollback();
        logger.error(error);
      }

      return {
        data: {
          id: institution.id,
          plaidInstitutionId: institution.institutionId,
          name: institution.name,
          syncDate: institution.syncDate?.toISO() ?? null,
          accounts: accountsResponse.accounts,
          categories: accountsResponse.categories,
        }
      };
    }
    catch (error) {
      logger.error(error);

      if (tokenResponse?.access_token) {
        await plaidClient.removeItem(tokenResponse.access_token, institutionResponse?.institution?.institution_id);
      }

      await trx.rollback();

      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async addOffline({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<ApiResponse<AddInstitutionResponse>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate({
      schema: schema.create({
        institution: schema.object().members({
          name: schema.string(),
        }),
        accounts: schema.array().members(
          schema.object().members({
            name: schema.string(),
            balance: schema.number(),
            type: schema.enum.optional(
              ['depository', 'credit', 'loan', 'investment', 'brokerage', 'other'] as const,
            ),
            subtype: schema.string(),
            tracking: schema.enum(
              ['None', 'Balances', 'Transactions', 'Uncategorized Transactions'] as const,
            ),
          }),
        ),
        startDate: schema.date(),
      }),
    });

    const trx = await db.transaction();

    try {
      user.useTransaction(trx)

      const budget = await user.related('budget')
        .query().firstOrFail();

      const fundingPool = await budget.getFundingPoolCategory({ client: trx });

      const institution = await budget.related('institutions').create({
        name: requestData.institution.name,
        institutionId: null,
      })

      const accounts = await Promise.all(requestData.accounts.map(async (acct) => {
        const newAcct = await institution.related('accounts').create({
          name: acct.name,
          balance: acct.balance,
          type: acct.type,
          subtype: acct.subtype,
          tracking: acct.tracking,
          startDate: requestData.startDate,
          rate: 0,
          closed: false,
        });

        await newAcct.updateStartingBalance(budget, fundingPool);

        return newAcct;
      }))

      await fundingPool.save();

      await trx.commit()

      return {
        data: {
          id: institution.id,
          plaidInstitutionId: institution.institutionId,
          name: institution.name,
          syncDate: institution.syncDate?.toISO() ?? null,
          accounts: accounts.map((acct) => ({
            id: acct.id,
            plaidId: null,
            name: acct.name,
            type: acct.type,
            subtype: acct.subtype,
            closed: acct.closed,
            tracking: acct.tracking,
            balance: acct.balance,
            plaidBalance: null,
            startDate: acct.startDate.toISODate(),
            rate: acct.rate,
          })),
          categories: [
            { id: fundingPool.id, balance: fundingPool.balance },
          ],
        }
      };
    }
    catch (error) {
      logger.error(error);
      await trx.rollback();
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<InstitutionProps> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await db.transaction();

    try {
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });

      const accountsResponse = await InstitutionController.addOnlineAccounts(
        budget, institution,
      );

      await trx.commit();

      return {
        id: institution.id,
        plaidInstitutionId: institution.institutionId,
        name: institution.name,
        syncDate: institution.syncDate?.toISO() ?? null,
        accounts: accountsResponse.accounts,
      };
    }
    catch (error) {
      logger.error(error);
      await trx.rollback();
      throw error;
    }
  }

  static async getUnconnectedAccounts(
    institution: Institution,
  ): Promise<UnlinkedAccountProps[]> {
    if (institution.accessToken) {
      const existingAccts = await Account.query().where('institutionId', institution.id);

      const plaidClient = await app.container.make('plaid')

      const { accounts } = await plaidClient.getAccounts(institution);

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
  async get({ request, auth: { user } }: HttpContext): Promise<UnlinkedAccountProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const inst = await Institution.findOrFail(request.params().instId);

    const accounts: UnlinkedAccountProps[] = await InstitutionController
      .getUnconnectedAccounts(inst);

    return accounts;
  }

  // private static async insertStartingBalance(
  //   budget: Budget,
  //   acct: Account,
  //   startDate: DateTime,
  //   startingBalance: number,
  //   fundingPool: Category,
  //   options?: {
  //     client: TransactionClientContract,
  //   },
  // ): Promise<void> {
  //   const transaction = (new Transaction())
  //     .fill({
  //       date: startDate,
  //       sortOrder: -1,
  //       budgetId: budget.id,
  //       type: TransactionType.STARTING_BALANCE,
  //     });

  //   if (options && options.client) {
  //     transaction.useTransaction(options.client);
  //   }

  //   // eslint-disable-next-line no-await-in-loop
  //   await transaction.save();

  //   const transId = transaction.id;

  //   const acctTransaction = (new AccountTransaction())
  //     .fill({
  //       transactionId: transId,
  //       accountId: acct.id,
  //       name: 'Starting Balance',
  //       amount: startingBalance,
  //     });

  //   if (options && options.client) {
  //     acctTransaction.useTransaction(options.client);
  //   }

  //   // eslint-disable-next-line no-await-in-loop
  //   await acctTransaction.save();

  //   if (acct.tracking === 'Transactions') {
  //     // eslint-disable-next-line no-await-in-loop
  //     const transactionCategory = (new TransactionCategory())
  //       .fill({
  //         transactionId: transId,
  //         categoryId: fundingPool.id,
  //         amount: startingBalance,
  //       });

  //     if (options && options.client) {
  //       transactionCategory.useTransaction(options.client);
  //     }

  //     // eslint-disable-next-line no-await-in-loop
  //     await transactionCategory.save();

  //     fundingPool.amount += startingBalance;

  //     // eslint-disable-next-line no-await-in-loop
  //     await fundingPool.save();
  //   }
  // }

  // eslint-disable-next-line class-methods-use-this
  private static async addOnlineAccounts(
    budget: Budget,
    institution: Institution,
  ): Promise<AddOnlineAccountsResponse> {
    if (!institution.accessToken) {
      throw new Error('accessToken is not defined');
    }

    const trx = institution.$trx;
    if (!trx) {
      throw new Error('database transaction not set');
    }

    const newAccounts: Account[] = [];

    const fundingPool = await budget.getFundingPoolCategory({ client: trx });

    const plaidClient = await app.container.make('plaid')

    const plaidAccountsResponse = await plaidClient.getAccounts(institution);

    // eslint-disable-next-line no-restricted-syntax
    for (const plaidAccount of plaidAccountsResponse.accounts) {
      let balance = plaidAccount.balances.current ?? 0;
      if (balance && (plaidAccount.type === 'credit' || plaidAccount.type === 'loan')) {
        balance = -balance;
      }

      const acct = await Account.firstOrCreate(
        { plaidAccountId: plaidAccount.account_id },
        {
          plaidAccountId: plaidAccount.account_id,
          name: plaidAccount.name,
          officialName: plaidAccount.official_name,
          mask: plaidAccount.mask,
          subtype: plaidAccount.subtype ?? '',
          type: plaidAccount.type,
          institutionId: institution.id,
          startDate: DateTime.now().startOf('month'),
          balance,
          plaidBalance: balance,
          tracking: 'Transactions',
          enabled: true,
          closed: false,
        },
        { client: trx },
      );

      newAccounts.push(acct);
    }

    const unassigned = await budget.getUnassignedCategory({ client: trx });

    const response = {
      accounts: newAccounts.map((a) => {
        const startDate = a.startDate.toISODate();

        return {
          id: a.id,
          plaidId: a.plaidAccountId,
          name: a.name,
          closed: a.closed,
          type: a.type,
          subtype: a.subtype,
          tracking: a.tracking,
          balance: a.balance,
          plaidBalance: a.plaidBalance,
          startDate,
          rate: a.rate,
        };
      }),
      categories: [
        { id: fundingPool.id, balance: fundingPool.balance },
        { id: unassigned.id, balance: unassigned.balance },
      ],
    };

    return response;
  }

  // eslint-disable-next-line class-methods-use-this
  public async addOfflineAccount({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContext): Promise<ApiResponse<AddOfflineAccountResponse> | void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string(),
        balance: schema.number(),
        type: schema.enum(['depository', 'credit', 'loan', 'investment', 'brokerage', 'other'] as const),
        subtype: schema.string(),
        tracking: schema.string(),
        rate: schema.number.optional(),
        startDate: schema.string(),
      }),
    });

    const trx = await db.transaction();

    try {
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });

      const fundingPool = await budget.getFundingPoolCategory({ client: trx });

      const start = DateTime.fromISO(requestData.startDate);

      const acct = new Account();

      acct.useTransaction(trx);

      acct.fill({
        name: requestData.name,
        institutionId: institution.id,
        startDate: start,
        balance: requestData.balance,
        tracking: requestData.tracking as TrackingType,
        enabled: true,
        type: requestData.type,
        subtype: requestData.subtype,
        rate: requestData.rate,
        closed: false,
      });

      await acct.save();

      if (acct.tracking !== 'Balances') {
        // eslint-disable-next-line no-await-in-loop
        // await InstitutionController.insertStartingBalance(
        //   budget, acct, start, account.balance, fundingPool, options,
        // );
      }
      else {
        await acct.updateAccountBalanceHistory(acct.balance);

        await acct.save();
      }

      const unassigned = await budget.getUnassignedCategory();

      await trx.commit();

      return {
        data: {
          account: {
            id: acct.id,
            name: acct.name,
            closed: acct.closed,
            type: acct.type,
            subtype: acct.subtype,
            tracking: acct.tracking,
            balance: acct.balance,
            plaidBalance: acct.plaidBalance,
            startDate: acct.startDate.toISODate()!,
            rate: acct.rate,
            plaidId: null,
          },
          categories: [
            { id: fundingPool.id, balance: fundingPool.balance },
            { id: unassigned.id, balance: unassigned.balance },
          ],
        }
      }
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
  }: HttpContext): Promise<(AccountSyncResult | null)[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await db.transaction();

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
  }: HttpContext): Promise<InstitutionSyncResponse | null> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await db.transaction();

    try {
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });

      await institution.syncUpdate();

      await trx.commit();

      return {
        syncDate: institution.syncDate?.toISO() ?? '',
        accounts: [],
        categories: [],
      };
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
  }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const institution = await Institution.findOrFail(parseInt(request.params().instId, 10));

    if (institution.accessToken === null || institution.accessToken === '') {
      throw new Exception(`access token not set for ${institution.plaidItemId}`);
    }

    const appName = env.get('APP_NAME');
    const webhook = env.get('PLAID_WEBHOOK');
    const redirect = env.get('PLAID_OAUTH_REDIRECT');

    const plaidClient = await app.container.make('plaid')

    const linkTokenResponse = await plaidClient.createLinkToken({
      user: {
        client_user_id: user.id.toString(),
      },
      client_name: appName,
      products: [Plaid.Products.Transactions],
      country_codes: [Plaid.CountryCode.Us],
      language: 'en',
      webhook,
      access_token: institution.accessToken,
      link_customization_name: 'account_select',
      update: {
        account_selection_enabled: true,
      },
      redirect_uri: redirect,
    });

    response.json({ linkToken: linkTokenResponse.link_token });
  }

  // eslint-disable-next-line class-methods-use-this
  public async info({ request, auth: { user } }: HttpContext): Promise<Plaid.Institution> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const institution = await Institution.findOrFail(request.params().instId);

    const plaidInstitution = institution.getPlaidInstition();

    return plaidInstitution;
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteAccount(
    { request, auth: { user }, logger }: HttpContext,
  ): Promise<CategoryBalanceProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await db.transaction();

    const budget = await user.related('budget').query().firstOrFail();
    budget.useTransaction(trx)

    try {
      const account = await Account.findOrFail(request.params().acctId, { client: trx });

      const result = await InstitutionController.deleteAccounts([account], budget);

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
    accounts: Account[],
    budget: Budget,
  ): Promise<CategoryBalanceProps[]> {
    const categoryBalances: CategoryBalanceProps[] = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const acct of accounts) {
      // eslint-disable-next-line no-await-in-loop
      const acctTrans = await AccountTransaction.query({ client: budget.$trx }).where('accountId', acct.id);

      // eslint-disable-next-line no-restricted-syntax
      for (const acctTran of acctTrans) {
        // eslint-disable-next-line no-await-in-loop
        const transaction = await Transaction.find(acctTran.transactionId, { client: budget.$trx });

        if (transaction) {
          const transCats = transaction.categories;

          if (transCats.length === 0) {
            if (acct.tracking === 'Transactions') {
              // eslint-disable-next-line no-await-in-loop
              const unassignedCat = await budget.getUnassignedCategory({ client: budget.$trx });

              unassignedCat.balance -= acctTran.amount;

              await unassignedCat.save();

              const catBalance = categoryBalances.find((cb) => cb.id === unassignedCat.id);

              if (catBalance) {
                catBalance.balance = unassignedCat.balance;
              }
              else {
                categoryBalances.push({ id: unassignedCat.id, balance: unassignedCat.balance })
              }
            }
          }
          else {
            // eslint-disable-next-line no-restricted-syntax
            for (const tc of transCats) {
              // eslint-disable-next-line no-await-in-loop
              const category = await Category.find(tc.categoryId, { client: budget.$trx });

              if (category) {
                category.balance -= tc.amount;

                // eslint-disable-next-line no-await-in-loop
                await category.save();

                const catBalance = categoryBalances.find((cb) => cb.id === category.id);

                if (catBalance) {
                  catBalance.balance = category.balance;
                }
                else {
                  categoryBalances.push({ id: category.id, balance: category.balance })
                }
              }

              // eslint-disable-next-line no-await-in-loop
              // await tc.delete();
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await acctTran.delete();

          // eslint-disable-next-line no-await-in-loop
          await transaction.delete();
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const balanceHistories = await BalanceHistory.query({ client: budget.$trx }).where('accountId', acct.id);

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(balanceHistories.map((balanceHistory) => balanceHistory.delete()));

      // eslint-disable-next-line no-await-in-loop
      await acct.delete();
    }

    return categoryBalances;
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete(
    { request, auth: { user }, logger }: HttpContext,
  ): Promise<CategoryBalanceProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await db.transaction();

    try {
      budget.useTransaction(trx)
  
      const institution = await Institution.findOrFail(request.params().instId, { client: trx });

      const accounts = await institution.related('accounts').query();

      if (institution.accessToken) {
        const plaidClient = await app.container.make('plaid')

        if (institution.institutionId === null) {
          throw new Error('institutionId is null')
        }
      
        await plaidClient.removeItem(institution.accessToken, institution.institutionId);
      }

      // eslint-disable-next-line no-restricted-syntax
      const result = await InstitutionController.deleteAccounts(accounts, budget);

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
