import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import plaidClient from '@ioc:Plaid';
import { InstitutionProps } from 'Common/ResponseTypes';
import Env from '@ioc:Adonis/Core/Env'
import { rules, schema } from '@ioc:Adonis/Core/Validator';
import User from 'App/Models/User';
import { CountryCode, Products } from 'plaid';

export default class UsersController {
  // eslint-disable-next-line class-methods-use-this
  public async get({ auth }: HttpContextContract): Promise<User> {
    if (!auth.user) {
      throw new Error('user is not defined');
    }

    return auth.user;
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<User> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const validationSchema = schema.create({
      email: schema.string([
        rules.trim(),
        rules.normalizeEmail({ allLowercase: true }),
        rules.unique({ table: 'users', column: 'email' }),
      ]),
    });

    const requestData = await request.validate({
      schema: validationSchema,
      messages: {
        'email.email': 'The email address is not valid.',
        'email.unique': 'This email address is already in use.',
      },
    });

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
  }: HttpContextContract): Promise<void> {
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
  }: HttpContextContract): Promise<User> {
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
  }: HttpContextContract): Promise<InstitutionProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    return user.getConnectedAccounts();
  }

  // eslint-disable-next-line class-methods-use-this
  async getLinkToken({ auth: { user }, response }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const webhook = Env.get('PLAID_WEBHOOK');
    const appName = Env.get('APP_NAME');

    const linkTokenResponse = await plaidClient.createLinkToken({
      user: {
        client_user_id: user.id.toString(),
      },
      client_name: appName,
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook,
    });

    response.json({ linkToken: linkTokenResponse.link_token });
  }
}
