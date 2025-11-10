import {
  BaseModel, belongsTo, column,
} from '@adonisjs/lucid/orm';
import Account from '#app/Models/Account';
import Transaction from '#app/Models/Transaction';
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

interface Location {
  address: string | null,
  city: string | null,
  region: string | null,
  postalCode: string | null,
  country: string | null,
  lat: number | null,
  lon: number | null,
  storeNumber: string | null,
}

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
  public providerTransactionId: string | null;

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

  @column()
  public statementId: number | null;

  @column({
    prepare: (value: Location) => JSON.stringify(value),
  })
  public location: Location | null;

  public static readonly Serializer = 'App/Serializer';
}

export default AccountTransaction;
