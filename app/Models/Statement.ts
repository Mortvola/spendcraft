import { DateTime } from 'luxon'
import {
  BaseModel, belongsTo, column,
  hasMany,
} from '@adonisjs/lucid/orm'
import AccountTransaction from './AccountTransaction.js'
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";
import type { JSON } from '#types/db'
import Account from './Account.ts';

export default class Statement extends BaseModel {
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

  @column()
  declare data: JSON<{
    shortTermCapitalGains: number,
    longTermCapitalGains: number,
    dividends: number,
    taxableInterest: number,
  }> | null
  
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
