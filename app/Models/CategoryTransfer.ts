import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm';
import CategorySplit from 'App/Models/CategorySplit';

class CategoryTransfer extends BaseModel {
  @column()
  public id: number;

  public async splits(trx) {
    return CategorySplit.query(trx).where('transaction_id', -this.id);
  }
}

export default CategoryTransfer;
