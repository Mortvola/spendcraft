import { BaseCommand, flags } from '@adonisjs/core/build/standalone'
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';

export default class CheckBalances extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:balances'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Checks the category and account balances'

  @flags.boolean({ alias: 'f', description: 'Repairs the balances' })
  public fix: boolean

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command
     */
    loadApp: true,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process
     */
    stayAlive: false,
  }

  public async run (): Promise<void> {
    const { default: User } = await import('App/Models/User');

    const trx = await Database.transaction();

    const users = await User.all({ client: trx });

    type Failures = {
      category: Category,
      transSum: number,
    };

    const failedUsers: {
      username: string,
      failures: Failures[],
    }[] = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const user of users) {
      // eslint-disable-next-line no-await-in-loop
      const categories = await Category
        .query({ client: trx })
        .whereHas('group', (group) => {
          group.where('userId', user.id)
        })
        .withAggregate('transactionCategory', (query) => {
          query.sum('amount').as('trans_sum').whereHas('transaction', (transaction) => {
            transaction.where('userId', user.id)
          });
        })
        .where('type', '!=', 'UNASSIGNED')
        .preload('group');

      const failures: Failures[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const cat of categories) {
        const transSum = (cat.$extras.trans_sum === null ? 0 : parseFloat(cat.$extras.trans_sum));
        if (cat.amount !== transSum) {
          failures.push({
            category: cat,
            transSum,
          })
        }
      }

      if (failures.length > 0) {
        failedUsers.push({
          username: user.username,
          failures,
        });
      }
    }

    if (failedUsers.length > 0) {
      // eslint-disable-next-line no-restricted-syntax
      for (const user of failedUsers) {
        this.logger.info(user.username);
        // eslint-disable-next-line no-restricted-syntax
        for (const failure of user.failures) {
          const { category, transSum } = failure;
          const difference = category.amount - transSum;
          this.logger.info(`\t"${category.group.name}:${category.name}" (${category.id}): ${category.amount}, Transactions: ${transSum}, difference: ${difference}`);

          if (this.fix) {
            category.amount = transSum;

            // eslint-disable-next-line no-await-in-loop
            await category.save();
          }
        }
      }

      if (this.fix) {
        await trx.commit();
      }
    }
    else {
      this.logger.info('No balance issues found');
    }
  }
}
