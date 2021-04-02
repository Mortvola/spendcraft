import {
  BaseModel, column, belongsTo, BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import Transaction from 'App/Models/Transaction';
import { DateTime } from 'luxon';

class AccountTransaction extends BaseModel {
  public serializeExtras(): Record<string, unknown> {
    return {
      date: DateTime.fromSQL(this.$extras.date).toFormat('yyyy-MM-dd'),
      categories: this.$extras.categories,
    };
  }

  @column()
  public id: number;

  @column()
  public accountId: number;

  @column()
  public transactionId: number;

  @belongsTo(() => Transaction)
  public transaction: BelongsTo<typeof Transaction>;

  @column()
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
