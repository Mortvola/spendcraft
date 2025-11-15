import db from '@adonisjs/lucid/services/db';
import Category from '#app/Models/Category';
import Budget from '#app/Models/Budget';
import { BaseCommand } from "@adonisjs/core/ace";
import { flags } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class CheckBalances extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:balances'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = 'Checks the category balances'

  @flags.string({ alias: 'u', description: 'Name of the user to analyze' })
  public user: string

  @flags.boolean({ alias: 'f', description: 'Repairs the balances' })
  public fix: boolean

  @flags.boolean({ alias: 'i', description: 'Interactive mode' })
  public interactive = false;
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

  private async checkCategoryBalances() {
    const trx = await db.transaction();

    try {
      let issuesFound = 0;
      let issuesFixed = 0;
      let budgets: Budget[] = [];

      if (this.user) {
        budgets = await Budget.query({ client: trx })
          .whereHas('users', (query) => {
            query.where('username', this.user)
          })
          .forUpdate();
      }
      else {
        budgets = await Budget.query({ client: trx })
          .forUpdate();
      }

      interface Failures {
        category: Category,
        transSum: number,
      }

      const failedApps: {
        appId: number,
        failures: Failures[],
      }[] = [];

       
      for (const budget of budgets) {
         
        const categories = await Category
          .query({ client: trx })
          .whereHas('group', (group) => {
            group.where('budgetId', budget.id)
          })
          .joinRaw(`join
            (
              select transCats."categoryId", sum(transCats.amount) as trans_sum
              from transactions t
              cross join lateral jsonb_to_recordset(t.categories) as transCats("categoryId" int, amount decimal)
              left outer join account_transactions at on at.transaction_id = t.id
              left outer join accounts a on a.id = at.account_id
              where (a.start_date is null OR t.date >= a.start_date)
              and t.deleted = false
              group by transCats."categoryId"
            ) AS T on T."categoryId" = categories.id
          `)
          .select('categories.*')
          .select('trans_sum')
          .preload('group');

        const failures: Failures[] = [];

         
        for (const cat of categories) {
          const transSum = (cat.$extras.trans_sum === null ? 0 : parseFloat(cat.$extras.trans_sum));
          if (Math.round(cat.balance * 100) !== Math.round(transSum * 100)) {
            failures.push({
              category: cat,
              transSum,
            })
          }
        }

        if (failures.length > 0) {
          failedApps.push({
            appId: budget.id,
            failures,
          });
        }
      }

      if (failedApps.length > 0) {
         
        for (const app of failedApps) {
          this.logger.info(`Budget ID: ${app.appId}`);
           
          for (const failure of app.failures) {
            const { category, transSum } = failure;
            const difference = (Math.round(category.balance * 100) - Math.round(transSum * 100)) / 100.0;
            this.logger.info(`\t"${category.group.name}:${category.name}" (${category.id}): ${category.balance.toFixed(2)}, Transactions: ${transSum.toFixed(2)}, difference: ${difference.toFixed(2)}`);

            issuesFound += 1;

            let fix = false;
            if (this.interactive) {
               
              fix = await this.prompt.confirm('Fix?')
            }

            if (fix || this.fix) {
              category.balance = transSum;

               
              await category.save();

              issuesFixed += 1;
            }
          }
        }

        if (this.interactive || this.fix) {
          await trx.commit();
          this.logger.info(`${issuesFixed} category balance issues fixed`);
        }
        else {
          this.logger.info(`${issuesFound} category balance issues found`);
          await trx.rollback();
        }
      }
      else {
        this.logger.info('No category balance issues found');
        await trx.rollback();
      }
    }
    catch (error) {
      console.log(error)
      await trx.rollback();
    }
  }

  // privagte async checkAccountBalances() {
  //   const trx = await Database.transaction();

  //   try {
  //     const apps = await Budget.all({ client: trx });

  //     type Failures = {
  //       account: Account,
  //       transSum: number,
  //     };

  //     const failedApps: {
  //       appId: number,
  //       failures: Failures[],
  //     }[] = [];

  //     // eslint-disable-next-line no-restricted-syntax
  //     for (const app of apps) {
  //       // eslint-disable-next-line no-await-in-loop
  //       const accounts = await Account
  //         .query()
  //         // .has('accountTransactions')
  //         .where('tracking', '!=', TrackingType.Balances)
  //         .whereHas('institution', (query) => {
  //           query.where('budgetId', app.id)
  //         })
  //         .withAggregate('accountTransactions', (query) => {
  //           query.sum('amount')
  //             .whereHas('transaction', (trxQuery) => {
  //               trxQuery
  //                 .where('deleted', false)
  //                 .andWhere('type', '!=', 4);
  //             })
  //             .where('pending', false)
  //             .as('trans_sum')
  //         })
  //         .withAggregate('accountTransactions', (query) => {
  //           query.sum('principle')
  //             .whereHas('transaction', (trxQuery) => {
  //               trxQuery
  //                 .where('deleted', false)
  //                 .andWhere('type', '!=', 4);
  //             })
  //             .where('pending', false)
  //             .as('principle_sum')
  //         })

  //       const failures: Failures[] = [];

  //       // eslint-disable-next-line no-restricted-syntax
  //       for (const account of accounts) {
  //         // eslint-disable-next-line no-await-in-loop
  //         const startingTrx = await account.related('accountTransactions').query()
  //           .whereHas('transaction', (query2) => {
  //             query2.where('type', 4)
  //           })
  //           .firstOrFail();

  //         let transSum: number;

  //         if (account.type === AccountType.Loan) {
  //           transSum = (
  //             account.$extras.principle_sum === null
  //               ? 0
  //               : parseFloat(account.$extras.principle_sum)
  //           ) + startingTrx.amount;
  //         }
  //         else {
  //           transSum = (
  //             account.$extras.trans_sum === null
  //               ? 0
  //               : parseFloat(account.$extras.trans_sum)
  //           ) + startingTrx.amount;
  //         }

  //         if (account.balance.toFixed(2) !== transSum.toFixed(2)) {
  //           failures.push({
  //             account,
  //             transSum,
  //           })
  //         }
  //       }

  //       if (failures.length > 0) {
  //         failedApps.push({
  //           appId: app.id,
  //           failures,
  //         });
  //       }
  //     }

  //     if (failedApps.length > 0) {
  //       // eslint-disable-next-line no-restricted-syntax
  //       for (const app of failedApps) {
  //         this.logger.info(`Budget ID: ${app.appId}`);
  //         // eslint-disable-next-line no-restricted-syntax
  //         for (const failure of app.failures) {
  //           const { account, transSum } = failure;
  //           const difference = account.balance - transSum;
   
  //           this.logger.info(`\t"${account.name}" (${account.id}): ${account.balance.toFixed(2)}, Transactions: ${transSum.toFixed(2)}, difference: ${difference.toFixed(2)}`);

  //           if (this.fix) {
  //             account.balance = transSum;

  //             // eslint-disable-next-line no-await-in-loop
  //             await account.save();
  //           }
  //         }
  //       }

  //       if (this.fix) {
  //         await trx.commit();
  //       }
  //       else {
  //         await trx.rollback();
  //       }
  //     }
  //     else {
  //       this.logger.info('No account balance issues found');
  //       await trx.rollback();
  //     }
  //   }
  //   catch (error) {
  //     await trx.rollback();
  //   }
  // }

  public async run (): Promise<void> {
    await this.checkCategoryBalances();
    // await this.checkAccountBalances();
  }
}
