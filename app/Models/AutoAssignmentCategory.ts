import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { parseMoneyCents, formatMoneyCents } from '#common/moneyCents'
import { encodeAutoAssignmentAmount, storedAutoAssignmentAmount,
  type AutoAssignmentAmount } from '#services/autoAssignmentAmount'

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
    columnName: 'amount', serializeAs: 'amount',
    consume: storedAutoAssignmentAmount,
    prepare: storedAutoAssignmentAmount,
    serialize: (value: AutoAssignmentAmount) => value.percentage ? value.amount
      : formatMoneyCents(value.amountCents),
  })
  public get allocationAmount(): AutoAssignmentAmount {
    const stored = storedAutoAssignmentAmount(this.$getAttribute('allocationAmount'))
    return this.percentage === true ? { percentage: true, amount: Number(stored) }
      : { percentage: false, amountCents: parseMoneyCents(stored) }
  }

  public set allocationAmount(value: AutoAssignmentAmount) {
    this.$setAttribute('allocationAmount', encodeAutoAssignmentAmount(value))
  }

  @column()
  public percentage: boolean | null
}
