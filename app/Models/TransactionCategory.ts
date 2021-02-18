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
    serialize: (value?: string) => (value ? parseFloat(value) : null),
  })
  public amount: number;
}

export default TransactionCategory;
