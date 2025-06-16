import * as jwt from 'jsonwebtoken';
import { HttpContext } from '@adonisjs/core/http';
import { schema, rules } from '@adonisjs/validator';
import env from '#start/env';
import logger from '@adonisjs/core/services/logger';
import mail from '@adonisjs/mail/services/main';
import User from '#app/Models/User';
import db from '@adonisjs/lucid/services/db';
import Budget from '#app/Models/Budget';
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';

export default class AuthController {
  // eslint-disable-next-line class-methods-use-this
  public async register({ request }: HttpContext) : Promise<void> {
    /**
     * Validate user details
     */
    const userDetails = await request.validate({
      schema: schema.create({
        username: schema.string([
          rules.trim(),
          rules.unique({ table: 'users', column: 'username' }),
        ]),
        email: schema.string([
          rules.trim(),
          rules.normalizeEmail({ allLowercase: true }),
          rules.email(),
          rules.unique({ table: 'users', column: 'email' }),
        ]),
        password: schema.string([
          rules.trim(),
          rules.confirmed('passwordConfirmation'),
          rules.password(),
        ]),
      }),
      messages: {
        'username.unique': 'An account with the requested username already exists',
        'username.required': 'A username is required',
        'email.email': 'A valid email address must be provided',
        'email.required': 'An email address is required',
        'email.unique': 'An account with the requested email address already exists',
        'password.required': 'A password is required',
        'passwordConfirmation.confirmed': 'The password confirmation does not match the password',
      },
    });

    const trx = await db.transaction();

    try {
      const budget = await (new Budget())
        .useTransaction(trx)
        .save();

      await budget.initialize();

      /**
     * Create a new user
     */
      const user = (new User())
        .useTransaction(trx)
        .fill({
          username: userDetails.username,
          email: userDetails.email,
          password: userDetails.password,
          budgetId: budget.id,
        });

      user.generatePassCode();

      user.save();

      await trx.commit();

      mail.send((message) => {
        message
          .from(env.get('MAIL_FROM_ADDRESS') as string, env.get('MAIL_FROM_NAME') as string)
          .to(user.email)
          .subject('Welcome!')
          .htmlView('emails/welcome', {
            code: user.oneTimePassCode?.code,
            expires: env.get('TOKEN_EXPIRATION'),
          });
      });
    }
    catch (error) {
      trx.rollback();
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async verifyEmail({ params, view }: HttpContext) : Promise<(string | void)> {
    const user = await User.find(params.id);

    if (user) {
      const payload = jwt.verify(params.token, user.generateSecret()) as Record<string, unknown>;

      if (payload.id === user.id) {
        if (!user.activated) {
          user.activated = true;
          user.save();

          return view.render('emailVerified');
        }

        if (user.pendingEmail) {
          // todo: if the matches fail, send the user to a failure page.
          if (payload.hash === sha256(user.pendingEmail)) {
            user.email = user.pendingEmail;
            user.pendingEmail = null;

            await user.save();

            return view.render('emailVerified');
          }
        }
      }

      logger.error(`Invalid payload "${payload.id}" in token for user ${user.username}`);
    }

    return undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  public async login({ auth, request, response }: HttpContext) : Promise<void> {
    const credentials = await request.validate({
      schema: schema.create({
        username: schema.string([rules.trim()]),
        password: schema.string([
          rules.trim(),
        ]),
      }),
      messages: {
        'username.required': 'A username is required',
        'password.required': 'A password is required',
      },
    });

    try {
      const token = await auth.use('jwt').attempt(
        credentials.username, credentials.password,
      );
      response.header('content-type', 'application/json');
      response.send({
        data: {
          access: token.accessToken,
          refresh: token.refreshToken,
        },
      })
    }
    catch (error) {
      if (error.code === 'E_INVALID_AUTH_UID' || error.code === 'E_INVALID_AUTH_PASSWORD') {
        response.status(401);
        response.header('content-type', 'application/json');

        const responseData: unknown = {
          errors: [
            { field: 'username', message: 'The username or password does not match our records.' },
            { field: 'password', message: 'The username or password does not match our records.' },
          ],
        };

        response.send(responseData);
      }
      else {
        throw (error);
      }
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async refresh({ auth, request, response }: HttpContext) : Promise<void> {
    const payload = await request.validate({
      schema: schema.create({
        data: schema.object().members({
          refresh: schema.string(),
        }),
      }),
    });

    try {
      const token = await auth.use('jwt').loginViaRefreshToken(payload.data.refresh);

      response.header('content-type', 'application/json');
      response.send({
        data: {
          access: token.accessToken,
          refresh: token.refreshToken,
        },
      });
    }
    catch (error) {
      if (error.message === 'Invalid refresh token') {
        response.status(400)
      }
      else {
        response.status(500)
      }
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async logout({ auth, request }: HttpContext) : Promise<void> {
    const payload = await request.validate({
      schema: schema.create({
        data: schema.object().members({
          refresh: schema.string(),
        }),
      }),
    });

    auth.use('jwt').revoke({ refreshToken: payload.data.refresh });
  }

  // eslint-disable-next-line class-methods-use-this
  public async requestCode({ request, response }: HttpContext) : Promise<void> {
    const requestData = await request.validate({
      schema: schema.create({
        email: schema.string([
          rules.email(),
        ]),
      }),
      messages: {
        'email.email': 'A valid email address must be provided',
      },
    });

    const user = await User.findBy('email', requestData.email);

    if (user) {
      const code = user.generatePassCode();

      await user.save();

      mail.send((message) => {
        message
          .from(env.get('MAIL_FROM_ADDRESS') as string, env.get('MAIL_FROM_NAME') as string)
          .to(user.email)
          .subject('Verification Code')
          .htmlView('emails/verification-code', {
            code,
            expires: env.get('TOKEN_EXPIRATION'),
          });
      });

      response.header('content-type', 'application/json');
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async verifyCode({ auth, request, response }: HttpContext): Promise<void> {
    const requestData = await request.validate({
      schema: schema.create({
        email: schema.string(),
        code: schema.string(),
      }),
    });

    const user = await User.findBy('email', requestData.email);

    if (user && user.oneTimePassCode) {
      if (requestData.code.toUpperCase() === user.oneTimePassCode.code.toUpperCase()) {
        const now = DateTime.now();

        if (now > user.oneTimePassCode.expires) {
          console.log(`code has expired: ${now.toString()}, ${user.oneTimePassCode.expires.toString()}`)

          response.status(422)

          response.json({
            errors: [{
              field: 'code',
              message: 'This code has expired.',
            }],
          })
        }
        else {
          user.oneTimePassCode = null;
          await user.save();

          const token = await auth.use('jwt').generate(user);

          response.header('content-type', 'application/json');
          response.send({
            data: {
              access: token.accessToken,
              refresh: token.refreshToken,
              username: user.username,
            },
          });
        }
      }
      else {
        console.log(`code does not match: ${requestData.code}, ${user.oneTimePassCode.code}`)
        response.status(422)

        response.json({
          errors: [{
            field: 'code',
            message: 'This code is not valid.',
          }],
        });
      }
    }
    else {
      response.status(422)
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async updatePassword({
    auth: { user },
    request,
  }: HttpContext) : Promise<(string | void)> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate({
      schema: schema.create({
        password: schema.string([
          rules.trim(),
          rules.confirmed('passwordConfirmation'),
          rules.password(),
        ]),
      }),
      messages: {
        'password.required': 'A password is required',
        'passwordConfirmation.confirmed': 'The password confirmation does not match the password',
      },
    });

    user.password = requestData.password;
    await user.save();

    return undefined;
  }
}
