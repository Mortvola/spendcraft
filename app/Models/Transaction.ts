import { BaseModel, hasMany, HasMany, column, belongsTo, BelongsTo, hasOne, HasOne } from '@ioc:Adonis/Lucid/Orm';
import AccountTransaction from 'App/Models/AccountTransaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import { DateTime } from 'luxon';
import User from 'App/Models/User';

class Transaction extends BaseModel {
  @column()
  public id: number;

  @column.date()
  public date: DateTime;

  @hasOne(() => AccountTransaction)
  public acccountTransation: HasOne<typeof AccountTransaction>;

  @hasMany(() => TransactionCategory)
  public categories: HasMany<typeof TransactionCategory>;

  @column()
  public sortOrder: number;

  @column()
  public type: number;

  @belongsTo(() => User)
  public institution: BelongsTo<typeof User>
}

export default Transaction;
