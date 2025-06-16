import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class AutoAssignmentCategory extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true, serializeAs: null })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column({ serializeAs: null })
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
