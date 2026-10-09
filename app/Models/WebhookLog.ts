import { DateTime } from 'luxon'
import { BaseModel, column, computed } from '@adonisjs/lucid/orm'
import redactDiagnostics from '#providers/Plaid/redactDiagnostics'

export default class WebhookLog extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column({
    prepare: (value: unknown) => JSON.stringify(redactDiagnostics(value)),
  })
  public request: unknown | null;

  @computed()
  readonly type = 'Webhook';
}
