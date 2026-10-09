import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class PlaidItemCleanup extends BaseModel {
  static table = 'plaid_item_cleanups'
  @column({ isPrimary: true }) declare id: string
  @column() declare providerContext: string
  @column() declare itemId: string
  @column({ serializeAs: null }) declare encryptedAccessToken: string | null
  @column() declare keyVersion: string
  @column() declare status: 'protected' | 'pending' | 'review_required' | 'cancelled' | 'completed'
  @column() declare attemptCount: number
  @column.dateTime() declare createdAt: DateTime
  @column.dateTime() declare lastAttemptAt: DateTime | null
  @column.dateTime() declare nextAttemptAt: DateTime | null
  @column.dateTime() declare completedAt: DateTime | null
  @column.dateTime() declare credentialExpiresAt: DateTime | null
  @column() declare lastErrorClass: string | null
  @column() declare lastErrorCode: string | null
}
