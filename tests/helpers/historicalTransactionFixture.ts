import db from '@adonisjs/lucid/services/db'
import type Transaction from '#models/Transaction'
import type { DateTime } from 'luxon'

// Seed historical/malformed fixtures directly rather than opting them into the
// new production writer contract. The standard per-statement SQL guard applies.
export async function writeHistoricalTransactionFixture(transaction: Transaction, changes: {
  categories?: unknown, type?: number, date?: DateTime, deleted?: boolean,
}) {
  await db.from('transactions').where('id', transaction.id).update({
    ...(changes.categories === undefined ? {} : { categories: JSON.stringify(changes.categories) }),
    ...(changes.type === undefined ? {} : { type: changes.type }),
    ...(changes.date === undefined ? {} : { date: changes.date.toSQLDate() }),
    ...(changes.deleted === undefined ? {} : { deleted: changes.deleted }),
  })
}
