import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('plaid_item_cleanups', (table) => {
      table.uuid('id').primary()
      table.string('provider_context').notNullable()
      table.string('item_id').notNullable()
      table.text('encrypted_access_token').nullable()
      table.string('key_version').notNullable()
      table.string('status').notNullable()
      table.integer('attempt_count').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('last_attempt_at', { useTz: true }).nullable()
      table.timestamp('next_attempt_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('credential_expires_at', { useTz: true }).nullable()
      table.string('last_error_class').nullable()
      table.string('last_error_code').nullable()
      table.unique(['provider_context', 'item_id'])
      table.index(['status', 'next_attempt_at'])
      table.check("status IN ('protected', 'pending', 'review_required', 'cancelled', 'completed')")
      table.check('attempt_count >= 0')
      table.check("status NOT IN ('cancelled', 'completed') OR encrypted_access_token IS NULL")
    })
  }

  async down() {
    this.schema.dropTable('plaid_item_cleanups')
  }
}
