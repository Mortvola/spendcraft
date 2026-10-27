import { DateTime } from 'luxon'
import { BaseModel, column, beforeSave, afterSave } from '@adonisjs/lucid/orm'

import { decodeTransactionLogMoney } from '#services/taxMonetaryCodec'
import { consumeTransactionLogMoney, prepareTransactionLogMoney, stageTaxMoneySave, finishTaxMoneySave } from '#services/taxMonetaryStorage'

export default class TransactionLog extends BaseModel {
  @beforeSave()
  public static stageMoney(row: TransactionLog) { stageTaxMoneySave(row) }

  @afterSave()
  public static finishMoney(row: TransactionLog) { finishTaxMoneySave(row, 'changes') }

  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column({ columnName: 'application_id', serializeAs: null })
  public budgetId: number

  @column()
  public message: string

  @column({
    consume: (value, _key, row) => consumeTransactionLogMoney(value, row),
    prepare: (value, _key, row) => prepareTransactionLogMoney(value, row),
    serialize: value => decodeTransactionLogMoney(value),
  })
  public changes: Record<string, unknown> | null

  @column()
  public transactionId: number;
}
