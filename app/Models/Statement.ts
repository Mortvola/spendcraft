import { DateTime } from 'luxon'
import {
  BaseModel, belongsTo, column,
  hasMany, beforeSave, afterSave,
} from '@adonisjs/lucid/orm'
import AccountTransaction from './AccountTransaction.js'
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";
import Account from './Account.ts';
import { decodeStatementIncome } from '#services/statementIncomeCodec'
import type { StatementIncomeData } from '#services/statementIncomeCodec'
import { consumeStatementIncome, prepareStatementIncome, stageStatementIncomeSave, finishStatementIncomeSave } from '#services/statementIncomeStorage'

export default class Statement extends BaseModel {
  @beforeSave()
  public static stageIncome(row: Statement) { stageStatementIncomeSave(row) }

  @afterSave()
  public static finishIncome(row: Statement) { finishStatementIncomeSave(row) }

  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true, serializeAs: null })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column()
  public accountId: number

  @column.date()
  public startDate: DateTime

  @column.date()
  public endDate: DateTime

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public startingBalance: number

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public endingBalance: number

  @column({
    consume: (value, _key, row) => consumeStatementIncome(value, row),
    prepare: (value, _key, row) => prepareStatementIncome(value, row),
    serialize: (value) => decodeStatementIncome(value),
  })
  declare data: StatementIncomeData | null
  
  @hasMany(() => AccountTransaction)
  public accountTransactions: HasMany<typeof AccountTransaction>;

  @belongsTo(() => Account)
  public account: BelongsTo<typeof Account>;

  public serializeExtras() {
    return {
      debits: this.$extras.debits === null ? 0 : parseFloat(this.$extras.debits),
      credits: this.$extras.credits === null ? 0 : parseFloat(this.$extras.credits),
    }
  }
}
