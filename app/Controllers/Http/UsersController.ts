import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import plaidClient from '@ioc:Plaid';
import { InstitutionProps } from 'Common/ResponseTypes';
import Env from '@ioc:Adonis/Core/Env'

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
  }: HttpContextContract): Promise<InstitutionProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const application = await user.related('application').query().firstOrFail();

    return application.getConnectedAccounts();
  }

  // eslint-disable-next-line class-methods-use-this
  async getLinkToken({ auth: { user }, response }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const webhook = Env.get('PLAID_WEBHOOK');

    const linkTokenResponse = await plaidClient.createLinkToken({
      user: {
        client_user_id: user.id.toString(),
      },
      client_name: 'Balancing Life',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      webhook,
    });
    response.json({ linkToken: linkTokenResponse.link_token });
  }

  // eslint-disable-next-line class-methods-use-this
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public static async getProfile({ auth }: HttpContextContract): Promise<void> {
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
  public static async putProfile({ auth }: HttpContextContract): Promise<void> {
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
