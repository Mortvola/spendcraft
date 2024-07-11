import { DateTime } from 'luxon'
import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export type Change = {
  transactions?: {
    modified: number[],
    deleted: number[],
  },
  institutions?: {
    modified: number[],
    deleted: number[],
  },
  accounts?: {
    modified: number[],
    deleted: number[],
  },
  categories?: {
    modified: number[],
    deleted: number[],
  },
  groups?: {
    modified: number[],
    deleted: number[],
  }
}

export default class BudgetChange extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column({ columnName: 'application_id', serializeAs: null })
  public budgetId: number

  @column({
    prepare: (value: Change) => JSON.stringify(value),
  })
  public change: Change;
}
