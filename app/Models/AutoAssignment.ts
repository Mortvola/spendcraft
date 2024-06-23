import { DateTime } from 'luxon'
import {
  BaseModel, HasMany, column, hasMany,
} from '@ioc:Adonis/Lucid/Orm'
import AutoAssignmentCategory from './AutoAssignmentCategory'

export default class AutoAssignment extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column({ columnName: 'application_id' })
  public budgetId: number

  @column()
  public searchString: string

  @hasMany(() => AutoAssignmentCategory)
  public autoAssignmentCategory: HasMany<typeof AutoAssignmentCategory>
}
