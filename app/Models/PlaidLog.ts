import { DateTime } from 'luxon'
import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export default class PlaidLog extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column()
  public request: string

  @column({
    prepare: (value: unknown) => JSON.stringify(value),
  })
  public response: unknown | null;

  @column()
  public institutionId: string | null;

  @column()
  public status: number;
}
