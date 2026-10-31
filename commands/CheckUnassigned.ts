import { formatMoneyCents } from '#common/moneyCents'
import { validateStoredCategoryConservation } from '#services/transactionCategoryStorage';
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

    try {
      const budgets = await Budget.query().select('id');

      for (const selected of budgets) {
        const count = await Database.transaction(async (trx) => {
          const budget = await Budget.query({ client: trx })
            .where('id', selected.id).forUpdate().firstOrFail();
          const unassignedCat = await budget.getUnassignedCategory({ client: trx });

          // Preserve the existing empty-JSON and AccountTransaction selection.
          const transactions = await budget.related('transactions').query().useTransaction(trx)
            .whereRaw('jsonb_array_length(categories) = ?', [0])
            .has('accountTransaction')
            .preload('accountTransaction');

          await Promise.all(transactions.map(async (transaction) => {
            transaction.categories = [{ categoryId: unassignedCat.id, amount: Number(
              formatMoneyCents(transaction
              .accountTransaction.amountCents)) }];
            await transaction.save();
            if (!transaction.deleted) await validateStoredCategoryConservation(transaction);
            return transaction;
          }));

          return transactions.length;
        });

        if (count > 0) {
          console.log(`budget: ${selected.id}, count: ${count}`);
        }
      }
    }
    catch (error) {
      console.log(error);
    }
  }

  public async run() {
    await this.checkUnassigned();
  }
}
