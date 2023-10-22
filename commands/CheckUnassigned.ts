import { BaseCommand } from '@adonisjs/core/build/standalone'

export default class CheckUnassigned extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:unassigned'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

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

  // eslint-disable-next-line class-methods-use-this
  private async checkUnassigned() {
    const { default: Database } = await import('@ioc:Adonis/Lucid/Database');
    const { default: Budget } = await import('App/Models/Budget');

    const trx = await Database.transaction();

    try {
      const budgets = await Budget.all({ client: trx });

      await Promise.all(budgets.map(async (budget) => {
        const unassignedCat = await budget.getUnassignedCategory();

        // Find all transactions that don't have transaction categories.
        const transactions = await budget.related('transactions').query()
          .doesntHave('transactionCategories')
          .has('accountTransaction')
          .preload('accountTransaction');

        if (transactions.length > 0) {
          // Create an unassigned transaction category for each found transaction.
          await Promise.all(transactions.map(async (transaction) => (
            transaction.related('transactionCategories').create({
              amount: transaction.accountTransaction.amount,
              categoryId: unassignedCat.id,
            })
          )));

          console.log(`budget: ${budget.id}, count: ${transactions.length}`);
        }
      }));

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
    }
  }

  public async run() {
    await this.checkUnassigned();
  }
}
