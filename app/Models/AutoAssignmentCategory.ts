import { DateTime } from 'luxon'
import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export default class AutoAssignmentCategory extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public autoAssignmentId: number

  @column()
  public categoryId: number

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public amount: number

  @column()
  public percentage: boolean
}
