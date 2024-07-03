/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column,
} from '@ioc:Adonis/Lucid/Orm';
import Account from 'App/Models/Account';
import Transaction from 'App/Models/Transaction';

type Location = {
  address: string | null,
  city: string | null,
  region: string | null,
  postalCode: string | null,
  country: string | null,
  lat: number | null,
  lon: number | null,
  storeNumber: string | null,
};

class AccountTransaction extends BaseModel {
  @column({ serializeAs: null })
  public id: number;

  @column()
  public accountId: number;

  @column()
  public transactionId: number;

  @belongsTo(() => Transaction)
  public transaction: BelongsTo<typeof Transaction>;

  @belongsTo(() => Account)
  public account: BelongsTo<typeof Account>;

  @column({ serializeAs: null })
  public provider: 'NONE' | 'PLAID' | 'OFX';

  @column({ serializeAs: null })
  public providerTransactionId: string;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public amount: number;

  @column({
    consume: (value: string) => (value !== null ? parseFloat(value) : null),
  })
  public principle: number | null;

  @column()
  public name: string;

  @column()
  public pending: boolean;

  @column()
  public paymentChannel: string | null;

  @column()
  public merchantName: string | null;

  @column()
  public accountOwner: string | null;

  @column({
    prepare: (value: Location) => JSON.stringify(value),
  })
  public location: Location | null;

  public static get Serializer(): string {
    return 'App/Serializer';
  }
}

export default AccountTransaction;
