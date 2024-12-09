import { DateTime } from 'luxon'
import {
  BaseModel, column,
  HasMany,
  hasMany,
} from '@ioc:Adonis/Lucid/Orm'
import AccountTransaction from './AccountTransaction'

export default class Statement extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
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

  @hasMany(() => AccountTransaction)
  public accountTransactions: HasMany<typeof AccountTransaction>;

  public serializeExtras() {
    return {
      debits: this.$extras.debits === null ? 0 : parseFloat(this.$extras.debits),
      credits: this.$extras.credits === null ? 0 : parseFloat(this.$extras.credits),
    }
  }
}
