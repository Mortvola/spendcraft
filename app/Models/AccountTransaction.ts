import {
  BaseModel, column, belongsTo, BelongsTo,
  hasOne, HasOne,
} from '@ioc:Adonis/Lucid/Orm';
import Transaction from 'App/Models/Transaction';
import Account from 'App/Models/Account';

class AccountTransaction extends BaseModel {
  @column()
  public id: number;

  @belongsTo(() => Account)
  public account: BelongsTo<typeof Account>;

  @hasOne(() => Transaction)
  public transaction: HasOne<typeof Transaction>;

  @column()
  public plaidTransactionId: string;

  @column()
  public amount: number;

  @column()
  public name: string;

  @column()
  public pending: boolean;

  public static get Serializer(): string {
    return 'App/Serializer';
  }
}

export default AccountTransaction;
