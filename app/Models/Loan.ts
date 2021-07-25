import {
  BaseModel, BelongsTo, belongsTo, column,
} from '@ioc:Adonis/Lucid/Orm'
import User from './User';

export default class Loan extends BaseModel {
  @column({ isPrimary: true })
  public id: number;

  @column()
  public name: string;

  @column()
  public amount: number;

  @column()
  public rate: number;

  @column({ serializeAs: 'numberOfPayments' })
  public numberOfPayments: number;

  @column({ serializeAs: 'paymentAmount' })
  public paymentAmount: number;

  @belongsTo(() => User)
  public user: BelongsTo<typeof User>;

  @column({ serializeAs: null })
  public userId: number;
}
