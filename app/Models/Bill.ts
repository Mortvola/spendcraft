import { DateTime } from 'luxon'
import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

type BillCategory = {
  categoryId: number,
  amount: number,
}

export default class Bill extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public name: string

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public amount: number

  @column.date()
  public dueDate: DateTime

  @column()
  public recurrence: number

  @column({
    prepare: (value: BillCategory) => JSON.stringify(value),
  })
  public categories: BillCategory;
}
