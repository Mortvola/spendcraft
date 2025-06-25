import { HttpContext } from '@adonisjs/core/http';
import { ApiResponse, InstitutionProps } from '#common/ResponseTypes';
import env from '#start/env'
import { rules, schema } from '@adonisjs/validator';
import User from '#app/Models/User';
import * as Plaid from 'plaid';
import db from '@adonisjs/lucid/services/db';
import { Exception } from '@adonisjs/core/exceptions';
import app from '@adonisjs/core/services/app';
import { update } from '#app/validation/Validators/user';

export default class UsersController {
  // eslint-disable-next-line class-methods-use-this
  public async get({ auth }: HttpContext): Promise<ApiResponse<User>> {
    if (!auth.user) {
      throw new Error('user is not defined');
    }

    return {
      data: auth.user,
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<User> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validateUsing(update)
      // messages: {
      //   'email.email': 'The email address is not valid.',
      //   'email.unique': 'This email address is already in use.',
      // },

    user.pendingEmail = requestData.email;

    await user.save();

    user.sendEmailAddressVerification();

    return user;
  }

  // eslint-disable-next-line class-methods-use-this
  public async resendEmailVerification({
    auth: {
      user,
    },
  }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    user.sendEmailAddressVerification();
  }

  // eslint-disable-next-line class-methods-use-this
  public async deletePending({
    auth: {
      user,
    },
  }: HttpContext): Promise<User> {
    if (!user) {
      throw new Error('user is not defined');
    }

    user.pendingEmail = null;

    await user.save();

    return user;
  }

  // eslint-disable-next-line class-methods-use-this
  public async getConnectedAccounts({
    auth: {
      user,
    },
  }: HttpContext): Promise<ApiResponse<InstitutionProps[]>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    return {
      data: await user.getConnectedAccounts(),
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async getLinkToken({ auth: { user }, response }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const webhook = env.get('PLAID_WEBHOOK');
    const appName = env.get('APP_NAME');
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
      link_customization_name: 'account_select',
      redirect_uri: redirect,
    });

    response.json({ linkToken: linkTokenResponse.link_token });
  }

  // eslint-disable-next-line class-methods-use-this
  async addApnsToken({ auth: { user }, request, response }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate({
      schema: schema.create({
        token: schema.string([
          rules.trim(),
          rules.minLength(1),
        ]),
      }),
    });

    const existingToken = await user.related('apnsTokens')
      .query()
      .where('token', requestData.token)
      .first();

    if (!existingToken) {
      await user.related('apnsTokens').create({
        token: requestData.token,
      });
    }

    response.status(204)
  }

  // eslint-disable-next-line class-methods-use-this
  async registerWebPush({ auth: { user }, request }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    // const requestData = await request.validate({
    //   schema: schema.create({
    //     token: schema.string([
    //       rules.trim(),
    //       rules.minLength(1),
    //     ]),
    //   }),
    // });

    const body = request.raw();

    if (!body) {
      throw new Exception('missing subscription date')
    }

    await user.related('pushSubscriptions').create({
      subscription: JSON.parse(body),
      type: 'web',
    })
  }

  // eslint-disable-next-line class-methods-use-this
  async delete({ auth: { user } }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);

      await user.delete();

      const others = await User.query({ client: trx }).where('budgetId', user.budgetId);

      if (others.length === 0) {
        // No other users are using this budget so delete it
        const budget = await user.related('budget').query().first();

        if (budget) {
          // Delete institutions
          const institutions = await budget.related('institutions').query();

          await Promise.all(institutions.map(async (institution) => {
            const accounts = await institution.related('accounts').query();

            await Promise.all(accounts.map(async (account) => {
              const acctTransactions = await account.related('accountTransactions').query();

              await Promise.all(acctTransactions.map(async (acctTransaction) => (
                await acctTransaction.delete()
              )))

              const histories = await account.related('balanceHistory').query();

              await Promise.all(histories.map(async (history) => (
                await history.delete()
              )))

              return account.delete();
            }));

            return institution.delete()
          }))

          // Delete transactions
          const transactions = await budget.related('transactions').query();

          await Promise.all(transactions.map(async (transaction) => (
            transaction.delete()
          )))

          // Delete groups
          const groups = await budget.related('groups').query();

          await Promise.all(groups.map(async (group) => {
            const categories = await group.related('categories').query();

            await Promise.all(categories.map(async (category) => {
              category.delete()
            }));

            return group.delete()
          }));

          await budget.delete();

          // Remove plaid items
          await Promise.all(institutions.map(async (institution) => {
            if (institution.accessToken) {
              const plaidClient = await app.container.make('plaid')
              await plaidClient.removeItem(institution.accessToken, institution.institutionId);
            }
          }));
        }
      }

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
    }
  }
}
