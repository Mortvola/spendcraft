import {
  BaseModel, belongsTo, BelongsTo, column, HasOne, hasOne,
} from '@ioc:Adonis/Lucid/Orm';
import Category from 'App/Models/Category';
import LoanTransaction from 'App/Models/LoanTransaction';
import Transaction from './Transaction';

class TransactionCategory extends BaseModel {
  @column()
  public id: number;

  @column()
  public transactionId: number;

  @column()
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

  @belongsTo(() => Transaction)
  public transaction: BelongsTo<typeof Transaction>;

  @hasOne(() => LoanTransaction)
  public loanTransaction: HasOne<typeof LoanTransaction>;

  @column()
  public comment: string;
}

export default TransactionCategory;
