import { DateTime } from 'luxon';
import { parseMoneyCents, formatMoneyCents, type MoneyCents } from '#common/moneyCents';
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
  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime;

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
    columnName: 'amount', serializeAs: 'amount',
    consume: parseMoneyCents, prepare: formatMoneyCents, serialize: formatMoneyCents,
  })
  public amountCents: MoneyCents;

  @column({
    columnName: 'principle', serializeAs: 'principle',
    consume: (value: string | null) => value === null ? null : parseMoneyCents(value),
    prepare: (value: MoneyCents | null | undefined) => value === null || value === undefined
      ? value : formatMoneyCents(value),
    serialize: (value: MoneyCents | null | undefined) => value === null || value === undefined
      ? value : formatMoneyCents(value),
  })
  public principalCents: MoneyCents | null;

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
}

export default AccountTransaction;
