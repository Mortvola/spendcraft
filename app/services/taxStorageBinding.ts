import type Transaction from '#models/Transaction'
import type { LucidRow } from '@adonisjs/lucid/types/model'
import { decodeTaxAttributions, encodeTaxAttributions } from './taxAmountCodec.ts'

const bound = new WeakSet<object>()
const excluded = new WeakSet<object>()
const pending = new WeakMap<object, ReturnType<typeof encodeTaxAttributions>>()

export function hasTaxStorage(row: object): boolean { return bound.has(row) }
export function isTaxStorageExcluded(row: object): boolean { return excluded.has(row) }
export function excludeTaxStorage(row: object): void {
  excluded.add(row); bound.delete(row); pending.delete(row)
}
export function bindResolvedTaxStorage(row: Transaction): void {
  if (bound.has(row) || excluded.has(row)) return
  if (row.$isPersisted && Object.hasOwn(row.$dirty, 'taxes')) throw new Error('Bind tax storage before attribution mutation')
  // Null/missing is not an implicit empty-array replacement or write-on-read.
  if (row.taxes !== null && row.taxes !== undefined) {
    row.$attributes.taxes = row.$isPersisted ? decodeTaxAttributions(row.taxes) : row.taxes
    if (row.$isPersisted) row.$original.taxes = structuredClone(row.$attributes.taxes)
  }
  bound.add(row)
}
export function prepareTaxStorage(value: unknown, row: LucidRow): string {
  return JSON.stringify(bound.has(row) && value !== null && value !== undefined ? encodeTaxAttributions(value) : value)
}
export function enableTaxStorageWrite(row: Transaction): void {
  if (!excluded.has(row)) bound.add(row)
}
export function stageTaxStorage(row: Transaction): void {
  pending.delete(row)
  if (bound.has(row) && Object.hasOwn(row.$dirty, 'taxes') && row.taxes !== null && row.taxes !== undefined) {
    pending.set(row, encodeTaxAttributions(row.taxes))
  }
}
export function finishTaxStorageSave(row: Transaction): void {
  const encoded = pending.get(row)
  if (!encoded) return
  const decoded = decodeTaxAttributions(encoded)
  row.$attributes.taxes = decoded
  row.$original.taxes = structuredClone(decoded)
  pending.delete(row)
}
