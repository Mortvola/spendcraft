import jwt from 'jsonwebtoken';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema, rules } from '@ioc:Adonis/Core/Validator';
import Env from '@ioc:Adonis/Core/Env';
import Logger from '@ioc:Adonis/Core/Logger';
import Mail from '@ioc:Adonis/Addons/Mail';
import User from 'App/Models/User';

export default class AuthController {
  // eslint-disable-next-line class-methods-use-this
  public async register({ request }: HttpContextContract) : Promise<string> {
    /**
     * Validate user details
     */
    const validationSchema = schema.create({
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
    });

    /**
     * Create a new user
     */
    const user = new User();
    user.email = userDetails.email;
    user.password = userDetails.password;
    await user.save();

    return 'Your account has been created';
  }

  // eslint-disable-next-line class-methods-use-this
  public async login({ auth, request, response }: HttpContextContract) : Promise<void> {
    const username = request.input('username');
    const password = request.input('password');
    await auth.attempt(username, password);

    response.header('content-type', 'application/json');
    response.send(JSON.stringify('/'));
  }

  // eslint-disable-next-line class-methods-use-this
  public async logout({ auth }: HttpContextContract) : Promise<void> {
    auth.logout();
  }

  static generateSecret(user: User) : string {
    return `${user.password}-${user.createdAt.toMillis()}`;
  }

  static generateToken(user: User) : unknown {
    const expiresIn = parseInt(Env.get('PASSWORD_RESET_TOKEN_EXPIRATION') as string, 10) * 60;
    return jwt.sign({ id: user.id }, AuthController.generateSecret(user), { expiresIn });
  }

  // eslint-disable-next-line class-methods-use-this
  public async forgotPassword({ request, response }: HttpContextContract) : Promise<void> {
    const email = request.input('email');
    const user = await User.findBy('email', email);

    if (user) {
      const token = AuthController.generateToken(user);

      const url = `${Env.get('APP_URL') as string}/password/reset/${user.id}/${token}`;

      Mail.send((message) => {
        message
          .from(Env.get('MAIL_FROM_ADDRESS') as string, Env.get('MAIL_FROM_NAME') as string)
          .to(user.email)
          .subject('Reset Password Notification')
          .htmlView('emails/reset-password', { url, expires: Env.get('PASSWORD_RESET_TOKEN_EXPIRATION') });
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
    const email = request.input('email');
    const password = request.input('password');
    const passwordConfirmation = request.input('passwordConfirmation');
    const token = request.input('token');

    const user = await User.findBy('email', email);

    if (!user) {
      return view.render('reset-password', { user, token, errorMessage: 'The user could not be found.' });
    }

    if (password !== passwordConfirmation) {
      return view.render('reset-password', { user, token, errorMessage: 'The passwords do not match.' });
    }

    let payload: Record<string, unknown> = { id: null };

    try {
      payload = jwt.verify(token, AuthController.generateSecret(user)) as Record<string, unknown>;
    }
    catch (error) {
      Logger.error(error);
    }

    if (payload.id !== user.id) {
      return view.render('reset-password', { user, token, errorMessage: 'The token is no longer valid.' });
    }

    user.password = password;
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
    const currentPassword = request.input('currentPassword');
    const password = request.input('password');
    const passwordConfirmation = request.input('passwordConfirmation');
    let { user } = auth;

    response.header('content-type', 'application/json');

    if (!user) {
      response.unauthorized({ errors: { currentPassword: 'User is unauthorized' } });
      return undefined;
    }

    try {
      user = await auth.verifyCredentials(user.username, currentPassword);
    }
    catch {
      response.notAcceptable(JSON.stringify({ errors: { currentPassword: 'Password is not valid' } }));
      return undefined;
    }

    if (!password || password !== passwordConfirmation) {
      response.notAcceptable(JSON.stringify({ errors: { passwordConfirmation: 'New password and confirmation do not match' } }));
      return undefined;
    }

    user.password = password;
    await user.save();

    return undefined;
  }
}
