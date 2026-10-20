import type Transaction from '#models/Transaction'
import type { LucidRow } from '@adonisjs/lucid/types/model'
import { decodeCategoryAllocations, encodeCategoryAllocations } from './categoryAmountCodec.ts'

export const bound = new WeakSet<object>()
const pendingWrites = new WeakMap<object, ReturnType<typeof encodeCategoryAllocations>>()
export const requested = new WeakSet<object>()
export const excluded = new WeakSet<object>()

// New instances are opted in only by callers with a resolved non-Loan Account or type2/3 lifecycle.
export function requestCategoryStorage(transaction: Transaction, active = true): Transaction {
  if (active) requested.add(transaction)
  else excluded.add(transaction)
  return transaction
}

export function prepareCategoryStorage(value: unknown, transaction: LucidRow): string {
  return JSON.stringify(bound.has(transaction) ? encodeCategoryAllocations(value) : value)
}

export function finishCategoryStorageSave(transaction: Transaction): void {
  const encoded = pendingWrites.get(transaction)
  if (!encoded) return
  const decoded = decodeCategoryAllocations(encoded)
  transaction.$attributes.categories = decoded
  transaction.$original.categories = structuredClone(decoded)
  pendingWrites.delete(transaction)
}

export function bindResolvedCategoryStorage(row: Transaction): void {
  if (bound.has(row)) return
  if (row.$isPersisted && Object.hasOwn(row.$dirty, 'categories')) throw new Error('Bind Category storage before allocation mutation')
  const decoded = decodeCategoryAllocations(row.categories)
  row.$attributes.categories = decoded
  if (row.$isPersisted) row.$original.categories = structuredClone(decoded)
  bound.add(row)
}

export function stageCategoryStorage(transaction: Transaction): void {
  pendingWrites.delete(transaction)
  if (bound.has(transaction) && Object.hasOwn(transaction.$dirty, 'categories')) {
    pendingWrites.set(transaction, encodeCategoryAllocations(transaction.categories))
  }
}

export function excludeCategoryStorage(transaction: Transaction): void {
  excluded.add(transaction)
  bound.delete(transaction)
  requested.delete(transaction)
  pendingWrites.delete(transaction)
}

export function hasCategoryStorage(transaction: Transaction): boolean {
  return bound.has(transaction)
}
