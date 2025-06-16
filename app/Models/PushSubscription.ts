import { DateTime } from 'luxon'
import {
  BaseModel, column,
} from '@adonisjs/lucid/orm'

export default class PushSubscription extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public userId: number

  @column({
    prepare: (value: unknown) => JSON.stringify(value),
  })
  public subscription: unknown

  @column()
  public type: string
}
