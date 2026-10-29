import { BaseSchema } from '@adonisjs/lucid/schema'
import { roundAutoAssignmentAmount } from '../../app/services/autoAssignmentAmount.js'

// Generate only validated literal values; PostgreSQL does not bind parameters in
// this DDL expression. Unknown/changed rows yield NULL and fail the existing NOT NULL.
export function historicalAmountExpression(rows: readonly unknown[]): string {
  if (rows.length > 10000) throw new Error('auto_assignment_migration_requires_review')
  const ids = new Set<number>()
  const branches = rows.map(row => {
    if (typeof row !== 'object' || row === null || !('id' in row) || !('amount' in row)
      || !('auto_assignment_id' in row) || !('category_id' in row) || !('percentage' in row)
      || !('real_hex' in row)) throw new Error('invalid_historical_auto_assignment')
    const { id, auto_assignment_id: parent, category_id: category, percentage, real_hex: hex } = row
    for (const value of [id, parent, category]) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error(
        'invalid_historical_auto_assignment_id')
    }
    if (typeof id !== 'number' || ids.has(id) || typeof hex !== 'string' || !/^[0-9a-f]{8}$/.test(
      hex)
      || (percentage !== true && percentage !== false && percentage !== null)) throw new Error(
        'invalid_historical_auto_assignment')
    ids.add(id)
    const stored = roundAutoAssignmentAmount(row.amount).toFixed(2)
    const mode = percentage === null ? 'NULL' : percentage === true ? 'TRUE' : 'FALSE'
    return `WHEN id=${id} AND auto_assignment_id=${parent} AND category_id=${category}
      AND percentage IS NOT DISTINCT FROM ${mode} AND encode(float4send(amount),'hex')='${hex}'
      THEN '${stored}'::numeric(12,2)`
  })
  return branches.length ? `CASE ${branches.join('\n')} ELSE NULL::numeric(12,2) END` :
    'NULL::numeric(12,2)'
}

export default class extends BaseSchema {
  async up() {
    this.defer(async db => {
      if (!db.isTransaction) throw new Error('auto_assignment_migration_transaction_required')
      await db.rawQuery("SET LOCAL lock_timeout='5s'")
      await db.rawQuery("SET LOCAL statement_timeout='60s'")
      // Budget is the sole explicit application serialization lock. The ALTER
      // obtains PostgreSQL's normal DDL lock; no child/advisory lock is introduced.
      await db.rawQuery(`SELECT b.id FROM public.applications b WHERE EXISTS (
        SELECT 1 FROM public.auto_assignments a WHERE a.application_id=b.id)
        ORDER BY b.id FOR UPDATE OF b`)
      const schema = await db.rawQuery(
        `SELECT a.atttypid='real'::regtype AS is_real, a.attnotnull AS not_null
        FROM pg_attribute a WHERE a.attrelid='public.auto_assignment_categories'::regclass
        AND a.attname='amount' AND NOT a.attisdropped`)
      if (schema.rows.length !== 1 || !schema.rows[0].is_real || !schema.rows[0]
        .not_null) throw new Error('unexpected_auto_assignment_amount_schema')
      const rows = await db.from('auto_assignment_categories').select('id', 'auto_assignment_id',
        'category_id', 'amount', 'percentage',
        db.raw("encode(float4send(amount),'hex') AS real_hex"))
      const expression = historicalAmountExpression(rows)
      await db.rawQuery(
        `ALTER TABLE public.auto_assignment_categories ALTER COLUMN amount TYPE numeric(12,2) \
USING (${expression})`)
    })
  }

  async down() {
    throw new Error('auto_assignment_numeric_down_is_lossy_requires_recovery_review')
  }
}
