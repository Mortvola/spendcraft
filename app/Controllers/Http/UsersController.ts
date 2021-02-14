import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import plaidClient from '@ioc:Plaid';
import User from 'App/Models/User';

export default class UsersController {
  // eslint-disable-next-line class-methods-use-this
  async get({ auth }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!auth.user) {
      throw new Error('user is not defined');
    }

    return { username: auth.user.username };
  }

  // eslint-disable-next-line class-methods-use-this
  public async getConnectedAccounts({
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Array<Record<string, unknown>>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    return user.getConnectedAccounts();
  }

  // eslint-disable-next-line class-methods-use-this
  async getLinkToken({ auth, response }: HttpContextContract): Promise<void> {
    if (!auth.user) {
      throw new Error('user is not defined');
    }

    const linkTokenResponse = await plaidClient.createLinkToken({
      user: {
        client_user_id: auth.user.id.toString(),
      },
      client_name: 'debertas',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    response.json({ linkToken: linkTokenResponse.link_token });
  }

  // eslint-disable-next-line class-methods-use-this
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public static async getProfile({ auth, response }: HttpContextContract): Promise<void> {
    if (auth.user) {
      // response.send(auth.user.serialize({
      //   fields: [
      //     'endOfHikeDayExtension',
      //     'paceFactor',
      //     'startTime',
      //     'endTime',
      //     'breakDuration',
      //     'endDayExtension',
      //     'endHikeDayExtension',
      //   ],
      // }));
    }
  }

  // eslint-disable-next-line class-methods-use-this
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public static async putProfile({ auth, request }: HttpContextContract): Promise<void> {
    if (auth.user) {
      // const profile = request.post();

      // auth.user.endHikeDayExtension = profile.endHikeDayExtension;
      // auth.user.paceFactor = profile.paceFactor;
      // auth.user.startTime = profile.startTime;
      // auth.user.endTime = profile.endTime;
      // auth.user.breakDuration = profile.breakDuration;
      // auth.user.endDayExtension = profile.endDayExtension;
      // auth.user.endHikeDayExtension = profile.endHikeDayExtension;

      // auth.user.save();
    }
  }
}
