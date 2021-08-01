import {
  BaseModel, BelongsTo, belongsTo, column, hasOne, HasOne,
} from '@ioc:Adonis/Lucid/Orm';
import Account from 'App/Models/Account';
import Transaction from 'App/Models/Transaction';

class AccountTransaction extends BaseModel {
  @column({ serializeAs: null })
  public id: number;

  @column({ serializeAs: 'accountId' })
  public accountId: number;

  @column({ serializeAs: 'id' })
  public transactionId: number;

  @hasOne(() => Transaction)
  public transaction: HasOne<typeof Transaction>;

  @belongsTo(() => Account, {
    foreignKey: 'accountId',
    localKey: 'id',
  })
  public account: BelongsTo<typeof Account>;

  @column({ serializeAs: null })
  public plaidTransactionId: string;

  @column({
    consume: (value: string) => parseFloat(value),
  })
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
