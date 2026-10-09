import { randomUUID } from 'node:crypto'
import { AES256GCM } from '@adonisjs/core/encryption/drivers/aes_256_gcm'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Institution from '#models/Institution'
import Cleanup from '#models/PlaidItemCleanup'
import PlaidException from '#providers/Plaid/PlaidException'
import type PlaidWrapper from '#providers/Plaid/Plaid'
import { QueueNamesEnum } from '#contracts/QueueInterfaces'

const delays = [60, 300, 1800, 7200, 28800, 86400]
const bindingPrefix = 'binding-v2:'

export default class PlaidItemCleanupService {
  private validateId(id: string) {
    if (typeof id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
      throw new Error('Invalid Plaid cleanup ID')
    }
  }

  private async provider(context: string) {
    const provider = await app.container.make('plaid')
    if (provider.providerContext !== context) throw new Error('Plaid cleanup provider context mismatch')
    return provider
  }

  private context() {
    const config = app.config.get<{ environment: string, clientId: string }>('plaid')
    if (!config.environment || !config.clientId) throw new Error('Plaid cleanup provider context unavailable')
    return `${config.environment}:${config.clientId}`
  }

  private driver(version: string) {
    try {
      const keys: unknown = JSON.parse(app.config.get<string>('plaidCleanup.keys', '{}'))
      if (!version || typeof keys !== 'object' || keys === null || !(version in keys)) throw new Error()
      const key: unknown = Reflect.get(keys, version)
      if (typeof key !== 'string' || key.length < 32) throw new Error()
      return new AES256GCM({ id: `plaid-cleanup-${version}`, key })
    } catch {
      throw new Error('Plaid cleanup encryption unavailable')
    }
  }

  async ready() {
    const version = app.config.get<string>('plaidCleanup.activeKey', '')
    this.driver(version)
    await this.provider(this.context())
    await db.from('plaid_item_cleanups').select('id').limit(1)
  }

  async protect(itemId: string, token: string) {
    const id = randomUUID()
    const keyVersion = app.config.get<string>('plaidCleanup.activeKey', '')
    const providerContext = this.context()
    await this.provider(providerContext)
    const now = DateTime.utc()
    const ciphertext = bindingPrefix + this.driver(keyVersion).encrypt(token, undefined, JSON.stringify([id, providerContext, itemId]))
    return db.transaction(async (trx) => {
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [`${providerContext}:${itemId}`])
      return Cleanup.create({ id, itemId, providerContext, keyVersion,
        encryptedAccessToken: ciphertext, status: 'protected', attemptCount: 0,
        createdAt: now, nextAttemptAt: now.plus({ minutes: 5 }),
      }, { client: trx })
    })
  }

  async compensateUnprotected(itemId: string, token: string) {
    const context = this.context()
    let existingId: string | undefined
    await db.transaction(async (trx) => {
      // Serializes the narrow exchange/storage fallback against protection creation.
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [`${context}:${itemId}`])
      const existing = await Cleanup.query({ client: trx }).where('providerContext', context).where('itemId', itemId).forUpdate().first()
      if (existing) { existingId = existing.id; return }
      if (await Institution.query({ client: trx }).where('plaidItemId', itemId).first()) return
      const plaid = await this.provider(context)
      await plaid.removeItem(token, undefined, 15_000)
    })
    if (existingId) await this.attempt(existingId, true)
  }

  async lockSetup(id: string, trx: TransactionClientContract) {
    this.validateId(id)
    const row = await Cleanup.query({ client: trx }).where('id', id).forUpdate().firstOrFail()
    if (row.status !== 'protected' || row.providerContext !== this.context()) throw new Error('Plaid setup recovery state unavailable')
    return row
  }

  async cancelSetup(row: Cleanup) {
    row.status = 'cancelled'
    row.encryptedAccessToken = null
    row.nextAttemptAt = null
    row.completedAt = DateTime.utc()
    await row.save()
  }

  private finish(row: Cleanup, status: 'cancelled' | 'completed') {
    row.status = status
    row.encryptedAccessToken = null
    row.nextAttemptAt = null
    row.completedAt = DateTime.utc()
  }

  private review(row: Cleanup, classification: string, code: string | null = null) {
    row.status = 'review_required'
    row.nextAttemptAt = null
    row.lastErrorClass = classification
    row.lastErrorCode = code
    row.credentialExpiresAt ??= DateTime.utc().plus({ days: 30 })
    logger.error({ cleanupId: row.id, classification, code }, 'Plaid cleanup requires administrative review')
  }

  // Never persist/log provider bodies, messages or arbitrary codes.
  private classify(error: unknown) {
    if (error instanceof PlaidException && typeof error.plaidError === 'object' && error.plaidError !== null) {
      const type: unknown = Reflect.get(error.plaidError, 'error_type')
      const code: unknown = Reflect.get(error.plaidError, 'error_code')
      if (type === 'API_ERROR' && code === 'INTERNAL_SERVER_ERROR') return { retry: true, classification: 'provider_transient', code }
      if (type === 'RATE_LIMIT_EXCEEDED') return { retry: true, classification: 'rate_limit', code: null }
      // Conservative: already-absent responses also require review; no guessing about configuration.
      if (code === 'ITEM_NOT_FOUND' || code === 'INVALID_ACCESS_TOKEN') return { retry: false, classification: 'provider_review', code }
      return { retry: false, classification: 'provider_unknown', code: null }
    }
    return { retry: true, classification: 'transport_unknown', code: null }
  }

  async attempt(id: string, immediate = false, expiryOnly = false) {
    this.validateId(id)
    // Session-independent transaction advisory lock survives commits of the attempt
    // ledger below, and is released automatically on process/connection failure.
    const guard = await db.transaction()
    try {
      const lock = await guard.rawQuery('SELECT pg_try_advisory_xact_lock(hashtextextended(?, 0)) AS locked', [id])
      if (!lock.rows[0]?.locked) return
      let token: string | undefined
      let provider: PlaidWrapper | undefined
      await db.transaction(async (trx) => {
        const row = await Cleanup.query({ client: trx }).where('id', id).forUpdate().first()
        if (!row || row.status === 'cancelled' || row.status === 'completed') return
        if (await Institution.query({ client: trx }).where('plaidItemId', row.itemId).first()) {
          this.finish(row, 'cancelled'); await row.save(); return
        }
        const now = DateTime.utc()
        if (row.credentialExpiresAt && row.credentialExpiresAt <= now) {
          row.encryptedAccessToken = null
          this.review(row, 'credential_expired'); await row.save(); return
        }
        if (expiryOnly) return
        if (row.status === 'review_required' || (!immediate && (!row.nextAttemptAt || row.nextAttemptAt > now))) return
        let context: string
        try { context = this.context() }
        catch { this.review(row, 'context_unavailable'); await row.save(); return }
        if (row.providerContext !== context) {
          this.review(row, 'context_mismatch'); await row.save(); return
        }
        // The singleton SDK client may outlive configuration reloads. Check its
        // actual construction context, and retain this verified instance for the call.
        try { provider = await this.provider(context) }
        catch { this.review(row, 'provider_context_unavailable'); await row.save(); return }
        try {
          if (!row.encryptedAccessToken?.startsWith(bindingPrefix)) throw new Error()
          const decrypted = this.driver(row.keyVersion).decrypt<unknown>(row.encryptedAccessToken.slice(bindingPrefix.length), JSON.stringify([row.id, row.providerContext, row.itemId]))
          if (typeof decrypted !== 'string' || !decrypted) throw new Error()
          token = decrypted
        } catch {
          this.review(row, 'decryption_failed'); await row.save(); return
        }
        if (row.attemptCount >= 7) { this.review(row, 'exhausted'); await row.save(); token = undefined; return }
        row.status = 'pending'
        row.attemptCount++
        row.lastAttemptAt = now
        // Persist recovery timing before calling Plaid, including the crash/lost-response case.
        const delay = delays[Math.min(row.attemptCount - 1, delays.length - 1)]
        row.nextAttemptAt = now.plus({ seconds: delay * (0.8 + Math.random() * 0.4) })
        await row.save()
      })
      if (!token || !provider) return
      let outcome: ReturnType<PlaidItemCleanupService['classify']> | undefined
      try {
        await provider.removeItem(token, undefined, 15_000)
      } catch (error) { outcome = this.classify(error) }
      await db.transaction(async (trx) => {
        const row = await Cleanup.query({ client: trx }).where('id', id).forUpdate().firstOrFail()
        if (!outcome) this.finish(row, 'completed')
        else if (!outcome.retry || row.attemptCount >= 7) this.review(row, outcome.classification, outcome.code)
        else { row.lastErrorClass = outcome.classification; row.lastErrorCode = outcome.code }
        await row.save()
      })
    } finally { await guard.rollback() }
  }

  async sweep() {
    const now = DateTime.utc().toSQL()
    // Retention is PostgreSQL work, independent of Redis delivery. Recheck under
    // the attempt lock so an extension or active removal cannot race destruction.
    const expired = await Cleanup.query().whereNotNull('encryptedAccessToken').where('credentialExpiresAt', '<=', now).limit(100)
    for (const row of expired) await this.attempt(row.id, false, true)
    const rows = await Cleanup.query().whereIn('status', ['protected', 'pending']).where('nextAttemptAt', '<=', now).limit(100)
    if (!rows.length) return
    const bull = await app.container.make('bullmq')
    const queue = bull.queue<{ cleanupId: string }, null>(QueueNamesEnum.PlaidItemCleanup)
    queue.on('error', () => logger.error('Plaid cleanup enqueue infrastructure failure'))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const enqueue = async () => {
        for (const row of rows) await queue.add('cleanup', { cleanupId: row.id }, { removeOnComplete: true, removeOnFail: 100 })
      }
      await Promise.race([
        enqueue(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Plaid cleanup enqueue timed out')), 5_000)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
      // Graceful close can itself wait for an unavailable Redis connection.
      await queue.getBackend().close(true)
    }
  }

  async administer(id: string, action: 'retry' | 'extend', days = 30) {
    this.validateId(id)
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Retention extension must be 1–365 days')
    await db.transaction(async (trx) => {
      const row = await Cleanup.query({ client: trx }).where('id', id).forUpdate().firstOrFail()
      if (!row.encryptedAccessToken || row.status !== 'review_required') throw new Error('Cleanup is not eligible for administrative recovery')
      if (action === 'extend') row.credentialExpiresAt = DateTime.utc().plus({ days })
      else {
        if (row.credentialExpiresAt && row.credentialExpiresAt <= DateTime.utc()) throw new Error('Cleanup credential retention expired')
        row.status = 'pending'; row.attemptCount = 0; row.nextAttemptAt = DateTime.utc()
      }
      await row.save()
      logger.info({ cleanupId: row.id, action, days: action === 'extend' ? days : undefined }, 'Plaid cleanup administrative action')
    })
  }
}
