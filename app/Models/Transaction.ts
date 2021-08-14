/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany, column,
  belongsTo, BelongsTo, HasOne, hasOne,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';
import TransactionCategory from 'App/Models/TransactionCategory';
import AccountTransaction from 'App/Models/AccountTransaction';
import User from 'App/Models/User';
import { TransactionType } from 'Common/ResponseTypes';

class Transaction extends BaseModel {
  @column()
  public id: number;

  @column.date()
  public date: DateTime;

  @column()
  public accountTransactionId: number;

  @hasMany(() => TransactionCategory)
  public transactionCategories: HasMany<typeof TransactionCategory>;

  @column({ serializeAs: 'sortOrder' })
  public sortOrder: number;

  @column()
  public type: TransactionType;

  @hasOne(() => AccountTransaction)
  public accountTransaction: HasOne<typeof AccountTransaction>

  @belongsTo(() => User)
  public user: BelongsTo<typeof User>;

  @column({ serializeAs: null })
  public userId: number;

  @column()
  public comment: string;
}

export default Transaction;
