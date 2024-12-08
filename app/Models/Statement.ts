import { DateTime } from 'luxon'
import {
  BaseModel, BelongsTo, belongsTo, column,
} from '@ioc:Adonis/Lucid/Orm'
import Account from './Account'

export default class Statement extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public accountId: number

  @column.date()
  public startDate: DateTime

  @column.date()
  public endDate: DateTime

  @column()
  public startingBalance: number

  @column()
  public endingBalance: number
}
