import {
  BaseModel, BelongsTo, belongsTo, column, HasMany, hasMany,
} from '@ioc:Adonis/Lucid/Orm'
import Category from './Category';
import LoanTransaction from 'App/Models/LoanTransaction';

export default class Loan extends BaseModel {
  @column({ isPrimary: true })
  public id: number;

  @column()
  public name: string;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column()
  public rate: number;

  @column({ serializeAs: 'numberOfPayments' })
  public numberOfPayments: number;

  @column({ serializeAs: 'paymentAmount' })
  public paymentAmount: number;

  @column({ serializeAs: null })
  public userId: number;

  @hasMany(() => LoanTransaction)
  public loanTransactions: HasMany<typeof LoanTransaction>;

  @belongsTo(() => Category)
  public category: BelongsTo<typeof Category>

  @column({ serializeAs: null })
  public categoryId: number;
}
