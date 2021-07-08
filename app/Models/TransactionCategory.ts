import { BaseModel, column, HasOne, hasOne } from '@ioc:Adonis/Lucid/Orm';
import Category from './Category';

class TransactionCategory extends BaseModel {
  @column()
  public id: number;

  @column({
    serializeAs: 'transactionId',
  })
  public transactionId: number;

  @column({
    serializeAs: 'categoryId',
  })
  public categoryId: number;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public amount: number;

  @hasOne(() => Category, {
    foreignKey: 'id',
    localKey: 'categoryId',
  })
  public category: HasOne<typeof Category>
}

export default TransactionCategory;
