import type { LucidRow } from '@adonisjs/lucid/types/model'
import { isDeepStrictEqual } from 'node:util'
import { decodeFundingRules, decodeFundingMetadata, encodeFundingRules, encodeFundingMetadata,
  mapFundingRules, mapFundingMetadata } from './fundingAmountCodec.ts'

const originals = new WeakMap<object, unknown>()
const pending = new WeakMap<object, unknown>()
const stagedValues = new WeakMap<object, unknown>()
const replacements = new WeakSet<object>()

// Explicit CREATE/replacement requests encode supplied leaves, even when their values are
// unchanged.
export function requestFundingStorage(row: LucidRow): void { replacements.add(row) }

export function stageFundingStorage(row: LucidRow, property: 'fundingCategories' |
  'categories'): void {
  pending.delete(row)
  stagedValues.delete(row)
  if (!replacements.has(row)) return
  const encoded = property === 'categories' ? encodeFundingMetadata(row.$attributes[property])
    : encodeFundingRules(row.$attributes[property])
  stagedValues.set(row, encoded)
  row.$attributes[property] = encoded
}

export function consumeFundingStorage(value: unknown, row: LucidRow, metadata = false): unknown {
  const decoded = metadata ? decodeFundingMetadata(value) : decodeFundingRules(value)
  originals.set(row, structuredClone(value))
  return decoded
}

export function prepareFundingStorage(value: unknown, row: LucidRow, metadata = false): unknown {
  const original = originals.get(row)
  const map = metadata ? mapFundingMetadata : mapFundingRules
  // Only this hook's own staged object may already use storage field names.
  const input = stagedValues.get(row) === value ? value
    : metadata ? encodeFundingMetadata(value) : encodeFundingRules(value)
  const encoded = map(input, (amount, path) => {
    let old = original
    let current = value
    for (const key of path) {
      if (old === null || typeof old !== 'object') { old = undefined; break }
      if (current !== null && typeof current === 'object' && Object.hasOwn(old, 'categoryId')
        && (Reflect.get(old, 'categoryId') !== Reflect.get(current, 'categoryId')
          || Reflect.get(old, 'percentage') !== Reflect.get(current, 'percentage'))) { old =
            undefined; break }
      old = Reflect.get(old, key)
      current = current !== null && typeof current === 'object' ? Reflect.get(current,
        key) : undefined
    }
    if (row.$isPersisted && !replacements.has(row) && old !== null && old !== undefined
      && isDeepStrictEqual(amount, old)) return old
    return amount
  })
  pending.set(row, structuredClone(encoded))
  return encoded
}

export function finishFundingStorage(row: LucidRow, property: 'fundingCategories' | 'categories',
  raw = pending.get(row)): void {
  if (!pending.has(row)) { replacements.delete(row); stagedValues.delete(row); return }
  const decoded = consumeFundingStorage(raw, row, property === 'categories')
  row.$attributes[property] = decoded
  row.$original[property] = structuredClone(decoded)
  pending.delete(row)
  stagedValues.delete(row)
  replacements.delete(row)
}
