import jwt from 'jsonwebtoken';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema, rules } from '@ioc:Adonis/Core/Validator';
import Env from '@ioc:Adonis/Core/Env';
import Logger from '@ioc:Adonis/Core/Logger';
import Mail from '@ioc:Adonis/Addons/Mail';
import User from 'App/Models/User';
import Group from 'App/Models/Group';
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';

export default class AuthController {
  // eslint-disable-next-line class-methods-use-this
  public async register({ request, response }: HttpContextContract) : Promise<string> {
    /**
     * Validate user details
     */
    const validationSchema = schema.create({
      username: schema.string({ trim: true }, [
        rules.unique({ table: 'users', column: 'username' }),
      ]),
      email: schema.string({ trim: true }, [
        rules.email(),
        rules.unique({ table: 'users', column: 'email' }),
      ]),
      password: schema.string({ trim: true }, [
        rules.confirmed(),
      ]),
    });

    const userDetails = await request.validate({
      schema: validationSchema,
      messages: {
        'username.unique': 'An account with the requested username already exists',
        'username.required': 'A username is required',
        'email.email': 'A valid email address must be specified',
        'email.required': 'An email address is required',
        'email.unique': 'An account with the requested email address already exists',
        'password.required': 'A password is required',
        'password_confirmation.confirmed': 'The password confirmation does not match the password',
      },
    });

    /**
     * Create a new user
     */
    const user = new User();
    user.username = userDetails.username;
    user.email = userDetails.email;
    user.password = userDetails.password;
    await user.save();

    const trx = await Database.transaction();

    try {
      const systemGroup = (new Group()).useTransaction(trx);

      systemGroup.name = 'System';
      systemGroup.userId = user.id;
      systemGroup.system = true;

      await systemGroup.save();

      const unassignedCat = (new Category()).useTransaction(trx);

      unassignedCat.name = 'Unassigned';
      unassignedCat.type = 'UNASSIGNED';
      unassignedCat.amount = 0;
      unassignedCat.groupId = systemGroup.id;

      const fundingPoolCat = (new Category()).useTransaction(trx);

      fundingPoolCat.name = 'Funding Pool';
      fundingPoolCat.type = 'FUNDING POOL';
      fundingPoolCat.amount = 0;
      fundingPoolCat.groupId = systemGroup.id;

      const accountTransferCat = (new Category()).useTransaction(trx);

      accountTransferCat.name = 'Account Transfer';
      accountTransferCat.type = 'ACCOUNT TRANSFER';
      accountTransferCat.amount = 0;
      accountTransferCat.groupId = systemGroup.id;

      await unassignedCat.save();
      await fundingPoolCat.save();
      await accountTransferCat.save();

      trx.commit();
    }
    catch (error) {
      trx.rollback();
    }

    const token = AuthController.generateToken(user);

    const verificationLink = `${Env.get('APP_URL') as string}/activate/${token}/${user.id}`;

    Mail.send((message) => {
      message
        .from(Env.get('MAIL_FROM_ADDRESS') as string, Env.get('MAIL_FROM_NAME') as string)
        .to(user.email)
        .subject('Welcome to Debertas!')
        .htmlView('emails/welcome', { verificationLink, expires: Env.get('TOKEN_EXPIRATION') });
    });

    response.header('Content-type', 'application/json');

    return JSON.stringify('Your account has been created');
  }

  // eslint-disable-next-line class-methods-use-this
  public async verifyEmail({ params, view }: HttpContextContract) : Promise<(string | void)> {
    const user = await User.find(params.id);

    if (user) {
      const payload = jwt.verify(
        params.token, AuthController.generateSecret(user),
      ) as Record<string, unknown>;

      if (payload.id === parseInt(params.id, 10)) {
        user.activated = true;
        user.save();

        return view.render('emailVerified');
      }

      Logger.error(`Invalid payload "${payload.id}" in token for user ${user.username}`);
    }

    return undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  public async login({ auth, request, response }: HttpContextContract) : Promise<void> {
    const validationSchema = schema.create({
      username: schema.string({ trim: true }),
      password: schema.string({ trim: true }),
      remember: schema.string.optional({ trim: true }),
    });

    const credentials = await request.validate({
      schema: validationSchema,
      messages: {
        'username.required': 'A username is required',
        'password.required': 'A password is required',
      },
    });

    response.header('content-type', 'application/json');

    let responseData: unknown = JSON.stringify('/');

    try {
      await auth.attempt(credentials.username, credentials.password, credentials.remember === 'on');

      if (auth.user) {
        if (!auth.user.activated) {
          response.status(422);
          responseData = {
            errors: [
              { field: 'username', message: 'The account associated with this username has not been activated.' },
            ],
          };
        }
      }
    }
    catch (error) {
      if (error.code === 'E_INVALID_AUTH_UID' || error.code === 'E_INVALID_AUTH_PASSWORD') {
        response.status(422);
        responseData = {
          errors: [
            { field: 'username', message: 'The username or password does not match our records.' },
            { field: 'password', message: 'The username or password does not match our records.' },
          ],
        };
      }
    }

    response.send(responseData);
  }

  // eslint-disable-next-line class-methods-use-this
  public async logout({ auth }: HttpContextContract) : Promise<void> {
    auth.logout();
  }

  static generateSecret(user: User) : string {
    return `${user.password}-${user.createdAt.toMillis()}`;
  }

  static generateToken(user: User) : unknown {
    const expiresIn = parseInt(Env.get('TOKEN_EXPIRATION') as string, 10) * 60;
    return jwt.sign({ id: user.id }, AuthController.generateSecret(user), { expiresIn });
  }

  // eslint-disable-next-line class-methods-use-this
  public async forgotPassword({ request, response }: HttpContextContract) : Promise<void> {
    const validationSchema = schema.create({
      email: schema.string(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });
  
    const user = await User.findBy('email', requestData.email);

    if (user) {
      const token = AuthController.generateToken(user);

      const url = `${Env.get('APP_URL') as string}/password/reset/${user.id}/${token}`;

      Mail.send((message) => {
        message
          .from(Env.get('MAIL_FROM_ADDRESS') as string, Env.get('MAIL_FROM_NAME') as string)
          .to(user.email)
          .subject('Reset Password Notification')
          .htmlView('emails/reset-password', { url, expires: Env.get('TOKEN_EXPIRATION') });
      });

      response.header('content-type', 'application/json');
      response.send(JSON.stringify('We have e-mailed your password reset link!'));
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async resetPassword({ params, view }: HttpContextContract) : Promise<(string | void)> {
    const user = await User.find(params.id);

    if (user) {
      const payload = jwt.verify(
        params.token, AuthController.generateSecret(user),
      ) as Record<string, unknown>;

      if (payload.id === parseInt(params.id, 10)) {
        return view.render('reset-password', { user, token: params.token });
      }

      Logger.error(`Invalid payload "${payload.id}" in token for user ${user.username}`);
    }

    return undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updatePassword({
    request,
    response,
    view,
  }: HttpContextContract) : Promise<(string | void)> {
    const validationSchema = schema.create({
      email: schema.string(),
      password: schema.string(),
      passwordConfirmation: schema.string(),
      token: schema.string(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const user = await User.findBy('email', requestData.email);

    if (!user) {
      return view.render('reset-password', { user, token: requestData.token, errorMessage: 'The user could not be found.' });
    }

    if (requestData.password !== requestData.passwordConfirmation) {
      return view.render('reset-password', { user, token: requestData.token, errorMessage: 'The passwords do not match.' });
    }

    let payload: Record<string, unknown> = { id: null };

    try {
      payload = jwt.verify(requestData.token, AuthController.generateSecret(user)) as Record<string, unknown>;
    }
    catch (error) {
      Logger.error(error);
    }

    if (payload.id !== user.id) {
      return view.render('reset-password', { user, token: requestData.token, errorMessage: 'The token is no longer valid.' });
    }

    user.password = requestData.password;
    await user.save();

    response.redirect('/');

    return undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  public async changePassword({
    auth,
    request,
    response,
  }: HttpContextContract) : Promise<(string | void)> {
    const validationSchema = schema.create({
      currentPassword: schema.string(),
      password: schema.string(),
      passwordConfirmation: schema.string(),
    })

    const requestData = await request.validate({
      schema: validationSchema,
    });

    let { user } = auth;

    response.header('content-type', 'application/json');

    if (!user) {
      response.unauthorized({ errors: { currentPassword: 'User is unauthorized' } });
      return undefined;
    }

    try {
      user = await auth.verifyCredentials(user.username, requestData.currentPassword);
    }
    catch {
      response.notAcceptable(JSON.stringify({ errors: { currentPassword: 'Password is not valid' } }));
      return undefined;
    }

    if (!requestData.password || requestData.password !== requestData.passwordConfirmation) {
      response.notAcceptable(JSON.stringify({ errors: { passwordConfirmation: 'New password and confirmation do not match' } }));
      return undefined;
    }

    user.password = requestData.password;
    await user.save();

    return undefined;
  }
}
