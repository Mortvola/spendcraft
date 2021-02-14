import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm';

class TransactionCategory extends BaseModel {
  @column()
  public id: number;

  @column()
  public transactionId: number;

  @column()
  public categoryId: number;
}

export default TransactionCategory;
