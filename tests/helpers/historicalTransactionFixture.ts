import { formatMoneyCents, moneyCentsFromInteger } from '#common/moneyCents'
import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { encodeFundingMetadata } from '#services/fundingAmountCodec'
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

// Direct model fixtures can intentionally bypass lifecycle ownership binding.
// Seed migrated storage explicitly before exercising readers/accounting behavior.
export async function writeCanonicalTransactionFixture(transaction: Transaction) {
  const client = transaction.$trx ?? db
  const row = await client.from('transactions').where('id', transaction.id).firstOrFail()
  await client.from('transactions').where('id', transaction.id).update({
    categories: JSON.stringify(encodeFundingMetadata(row.categories.map(({ amountCents,
      ...allocation }: { amount?: unknown,
      amountCents?: number }) => ({ ...allocation, amount: amountCents === undefined
        ? encodeMonetaryAmount(allocation.amount)
        : formatMoneyCents(moneyCentsFromInteger(amountCents)) })))),
  })
}
