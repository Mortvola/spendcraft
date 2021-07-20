// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from "@ioc:Adonis/Lucid/Database";
import Category from 'App/Models/Category';
import Transaction from 'App/Models/Transaction';

export default class TransactionsController {
  // eslint-disable-next-line class-methods-use-this
  public async delete(
    { request }: HttpContextContract,
  ): Promise<{ balances: { id: number, balance: number}[] }> {
    const trx = await Database.transaction();

    const result: {
      balances: { id: number, balance: number}[],
    } = { balances: [] };

    try {
      const { trxId } = request.params();

      const transaction = await Transaction.findOrFail(trxId, { client: trx });

      const trxCategories = await transaction.related('categories').query();

      await Promise.all(trxCategories.map(async (trxCat) => {
        const category = await Category.find(trxCat.categoryId, { client: trx });

        if (category) {
          category.amount -= trxCat.amount;

          result.balances.push({ id: category.id, balance: category.amount });

          category.save();

          await trxCat.delete();
        }
      }));

      await transaction.delete();

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
    }

    return result;
  }
}
