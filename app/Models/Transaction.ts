import {
  BaseModel, hasMany, HasMany, column,
  belongsTo, BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';
import TransactionCategory from 'App/Models/TransactionCategory';
import AccountTransaction from 'App/Models/AccountTransaction';
import User from 'App/Models/User';

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
  public type: number;

  @belongsTo(() => AccountTransaction, {
    foreignKey: 'id',
    localKey: 'transactionId',
  })
  public accountTransaction: BelongsTo<typeof AccountTransaction>

  @belongsTo(() => User)
  public user: BelongsTo<typeof User>;

  @column({ serializeAs: null })
  public userId: number;
}

export default Transaction;
