import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeSave } from '@adonisjs/lucid/orm'
import { roundAutoAssignmentAmount } from '#services/autoAssignmentAmount'

export default class AutoAssignmentCategory extends BaseModel {
  @beforeSave()
  public static roundAmount(row: AutoAssignmentCategory) {
    if (Object.hasOwn(row.$dirty, 'amount')) row.amount = roundAutoAssignmentAmount(row.amount)
  }

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
    prepare: (value: number) => roundAutoAssignmentAmount(value).toFixed(2),
    serialize: (value: number, _attribute, model) => model.$attributes
      .percentage === true ? value : encodeMonetaryAmount(value),
  })
  public amount: number

  @column()
  public percentage: boolean
}
