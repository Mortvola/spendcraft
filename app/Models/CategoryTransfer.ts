import { BaseModel, column } from '@adonisjs/lucid/orm';
import CategorySplit from '#app/Models/CategorySplit';
import { TransactionClientContract } from '@adonisjs/lucid/types/database';

class CategoryTransfer extends BaseModel {
  @column()
  public id: number;

  public async splits(trx: TransactionClientContract) {
    return CategorySplit.query({ client: trx}).where('transaction_id', -this.id);
  }
}

export default CategoryTransfer;
