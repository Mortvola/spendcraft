import { BaseModel, column } from '@adonisjs/lucid/orm';
import CategorySplit from '#app/Models/CategorySplit';

class CategoryTransfer extends BaseModel {
  @column()
  public id: number;

  public async splits(trx) {
    return CategorySplit.query(trx).where('transaction_id', -this.id);
  }
}

export default CategoryTransfer;
