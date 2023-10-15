import { DateTime } from 'luxon'
import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'
import { PlaidTransaction } from '@ioc:Plaid'

export default class StagedTransaction extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public institutionId: number;

  @column()
  public plaidAccountId: string;

  @column({
    prepare: (value: PlaidTransaction) => JSON.stringify(value),
  })
  public transaction: PlaidTransaction;
}
