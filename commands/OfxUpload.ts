import { BaseCommand, args } from '@adonisjs/core/build/standalone'
import Drive from '@ioc:Adonis/Core/Drive';
import Database from '@ioc:Adonis/Lucid/Database';
import User from 'App/Models/User';
import Account from 'App/Models/Account';

export default class OfxUpload extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'ofx:upload'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Uploads an OFX file to the specified account';

  @args.string({ description: 'Name of the OFX file to upload' })
  public ofx: string

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command. Don't forget to call `node ace generate:manifest` 
     * afterwards.
     */
    loadApp: true,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process. Don't forget to call 
     * `node ace generate:manifest` afterwards.
     */
    stayAlive: false,
  }

  public async run() {
    const data = await Drive.get(this.ofx);

    if (!data) {
      throw new Error('file not found');
    }

    const trx = await Database.transaction();

    const username = await this.prompt.ask('Enter the username', {
      validate(answer) {
        if (!answer) {
          return 'A username is required.';
        }

        return true;
      },
    });

    try {
      const user = await User.findBy('username', username);

      if (!user) {
        throw new Error('Username not found');
      }

      const budget = await user.related('budget').query().firstOrFail();

      const institutions = await budget.related('institutions').query()
        .whereHas('accounts', (accountQuery) => accountQuery.where('tracking', '!=', 'Balances'))
        .orderBy('name');

      const institutionName = await this.prompt.choice('Select the institution', institutions.map((i) => i.name));

      const inst = institutions.find((i) => i.name === institutionName);

      if (!inst) {
        throw new Error('institution not found');
      }

      const accounts = await inst.related('accounts')
        .query()
        .where('tracking', '!=', 'Balances')
        .orderBy('name');

      let selectedAccount: string | null = null;

      selectedAccount = await this.prompt.choice(
        'Select the accounts',
        accounts.map((a) => a.name),
      );

      const account = await Account.findBy('name', selectedAccount, { client: trx });

      if (!account) {
        throw new Error('account not found');
      }

      await account.processOfx(data.toString(), budget, user);

      await trx.commit();
    }
    catch (error) {
      console.log(error.message);
      await trx.rollback();
    }
  }
}
