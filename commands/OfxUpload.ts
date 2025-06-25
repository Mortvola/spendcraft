import drive from '@adonisjs/drive/services/main';
import db from '@adonisjs/lucid/services/db';
import User from '#app/Models/User';
import Account from '#app/Models/Account';
import { BaseCommand } from "@adonisjs/core/ace";
import { args } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

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
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  public async run() {
    const disk = drive.use('fs')
    const data = await disk.get(this.ofx);

    if (!data) {
      throw new Error('file not found');
    }

    const trx = await db.transaction();

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
