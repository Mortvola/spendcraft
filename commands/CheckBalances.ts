import { BaseCommand, flags } from '@adonisjs/core/build/standalone'
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';
import Application from 'App/Models/Application';
import Account from 'App/Models/Account';
import AccountTransaction from 'App/Models/AccountTransaction';

export default class CheckBalances extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:balances'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Checks the category and account balances'

  @flags.string({ alias: 'u', description: 'Name of the user to analyze' })
  public user: string

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

  private async checkCategoryBalances() {
    const trx = await Database.transaction();

    try {
      let apps: Application[] = [];

      if (this.user) {
        apps = await Application.query({ client: trx })
          .whereHas('users', (query) => {
            query.where('username', this.user)
          });
      }
      else {
        apps = await Application.query({ client: trx });
      }

      type Failures = {
        category: Category,
        transSum: number,
      };

      const failedApps: {
        appId: number,
        failures: Failures[],
      }[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const app of apps) {
        // eslint-disable-next-line no-await-in-loop
        const categories = await Category
          .query({ client: trx })
          .whereHas('group', (group) => {
            group.where('applicationId', app.id)
          })
          .withAggregate('transactionCategory', (query) => {
            query.sum('amount').as('trans_sum')
              .whereHas('transaction', (transaction) => {
                transaction
                  .where('applicationId', app.id)
                  .andWhere('deleted', false)
              });
          })
          .preload('group');

        // Sum up all the transactions that do not have categories assigned
        // and add the amount to the unassigned category.
        // eslint-disable-next-line no-await-in-loop
        const unassignedTrans = await AccountTransaction
          .query({ client: trx })
          .whereHas('transaction', (query) => {
            query
              .where('applicationId', app.id)
              .andWhere('deleted', false)
              .doesntHave('transactionCategories')
          })
          .whereHas('account', (query) => {
            query.where('tracking', 'Transactions')
          })
          .where('pending', false)
          .sum('amount')
          .as('sum')
          .first();

        if (unassignedTrans && parseFloat(unassignedTrans.$extras.sum ?? 0) !== 0) {
          const unassignedCat = categories.find((c) => c.type === 'UNASSIGNED');
          if (unassignedCat) {
            unassignedCat.$extras.trans_sum = parseFloat(unassignedCat.$extras.trans_sum ?? 0)
              + parseFloat(unassignedTrans.$extras.sum ?? 0);
          }
        }

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
          failedApps.push({
            appId: app.id,
            failures,
          });
        }
      }

      if (failedApps.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const app of failedApps) {
          this.logger.info(`${app.appId}`);
          // eslint-disable-next-line no-restricted-syntax
          for (const failure of app.failures) {
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
        else {
          await trx.rollback();
        }
      }
      else {
        this.logger.info('No category balance issues found');
        await trx.rollback();
      }
    }
    catch (error) {
      await trx.rollback();
    }
  }

  private async checkAccountBalances() {
    const trx = await Database.transaction();

    try {
      const apps = await Application.all({ client: trx });

      type Failures = {
        account: Account,
        transSum: number,
      };

      const failedApps: {
        appId: number,
        failures: Failures[],
      }[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const app of apps) {
        // eslint-disable-next-line no-await-in-loop
        const accounts = await Account
          .query()
          // .has('accountTransactions')
          .where('tracking', '!=', 'Balances')
          .whereHas('institution', (query) => {
            query.where('applicationId', app.id)
          })
          .withAggregate('accountTransactions', (query) => {
            query.sum('amount')
              .whereHas('transaction', (trxQuery) => {
                trxQuery
                  .where('deleted', false)
                  .andWhere('type', '!=', 4);
              })
              .where('pending', false)
              .as('trans_sum')
          })
          .withAggregate('accountTransactions', (query) => {
            query.sum('principle')
              .whereHas('transaction', (trxQuery) => {
                trxQuery
                  .where('deleted', false)
                  .andWhere('type', '!=', 4);
              })
              .where('pending', false)
              .as('principle_sum')
          })

        const failures: Failures[] = [];

        // eslint-disable-next-line no-restricted-syntax
        for (const account of accounts) {
          // eslint-disable-next-line no-await-in-loop
          const startingTrx = await account.related('accountTransactions').query()
            .whereHas('transaction', (query2) => {
              query2.where('type', 4)
            })
            .firstOrFail();

          let transSum: number;

          if (account.type === 'loan') {
            transSum = (
              account.$extras.principle_sum === null
                ? 0
                : parseFloat(account.$extras.principle_sum)
            ) + startingTrx.amount;
          }
          else {
            transSum = (
              account.$extras.trans_sum === null
                ? 0
                : parseFloat(account.$extras.trans_sum)
            ) + startingTrx.amount;
          }

          if (account.balance.toFixed(2) !== transSum.toFixed(2)) {
            failures.push({
              account,
              transSum,
            })
          }
        }

        if (failures.length > 0) {
          failedApps.push({
            appId: app.id,
            failures,
          });
        }
      }

      if (failedApps.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const app of failedApps) {
          this.logger.info(`${app.appId}`);
          // eslint-disable-next-line no-restricted-syntax
          for (const failure of app.failures) {
            const { account, transSum } = failure;
            const difference = account.balance - transSum;
            this.logger.info(`\t"${account.name}" (${account.id}): ${account.balance}, Transactions: ${transSum}, difference: ${difference}`);

            if (this.fix) {
              account.balance = transSum;

              // eslint-disable-next-line no-await-in-loop
              await account.save();
            }
          }
        }

        if (this.fix) {
          await trx.commit();
        }
        else {
          await trx.rollback();
        }
      }
      else {
        this.logger.info('No account balance issues found');
        await trx.rollback();
      }
    }
    catch (error) {
      await trx.rollback();
    }
  }

  public async run (): Promise<void> {
    await this.checkCategoryBalances();
    await this.checkAccountBalances();
  }
}
