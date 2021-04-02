import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm';

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
}

export default TransactionCategory;
