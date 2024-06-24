import { DateTime } from 'luxon'
import {
  BaseModel, HasMany, column, hasMany,
} from '@ioc:Adonis/Lucid/Orm'
import AutoAssignmentCategory from './AutoAssignmentCategory'
import AutoAssignmentSearchString from './AutoAssignmentSearchString'

export default class AutoAssignment extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true, serializeAs: null })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column({ columnName: 'application_id', serializeAs: null })
  public budgetId: number

  @column()
  public name: string

  @hasMany(() => AutoAssignmentCategory)
  public categories: HasMany<typeof AutoAssignmentCategory>

  @hasMany(() => AutoAssignmentSearchString)
  public searchStrings: HasMany<typeof AutoAssignmentSearchString>
}
