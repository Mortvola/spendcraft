import { BaseCommand } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class CheckUnassigned extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:unassigned'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };
   
  private async checkUnassigned() {
    const { default: Database } = await import('@adonisjs/lucid/services/db');
    const { default: Budget } = await import('#models/Budget');

    const trx = await Database.transaction();

    try {
      const budgets = await Budget.all({ client: trx });

      await Promise.all(budgets.map(async (budget) => {
        const unassignedCat = await budget.getUnassignedCategory();

        // Find all transactions that don't have transaction categories.
        const transactions = await budget.related('transactions').query()
          .whereRaw('jsonb_array_length(categories) = ?', [0])
          .has('accountTransaction')
          .preload('accountTransaction');

        if (transactions.length > 0) {
          // Create an unassigned transaction category for each found transaction.
          await Promise.all(transactions.map(async (transaction) => {
            transaction.categories = [{ categoryId: unassignedCat.id, amount: transaction.accountTransaction.amount }];
            return transaction.save();
          }));

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
