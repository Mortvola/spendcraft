import { Exception } from '@adonisjs/core/exceptions'
import { encodeMonetaryAmount, decodeStoredMonetaryAmount } from './categoryAmountCodec.ts'

export interface TaxAttribution { type: string; amount: number }

function invalid(message = 'Invalid tax attribution amount'): never {
  throw new Exception(message, { status: 422 })
}

function attributions(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) invalid('Tax attributions must be an array')
  return value.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)
      || !('type' in entry) || typeof entry.type !== 'string') invalid('Invalid tax attribution entry')
    return { ...entry }
  })
}
export function encodeTaxAttributions(value: unknown) {
  return attributions(value).map(entry => ({ ...entry, amount: encodeMonetaryAmount(entry.amount) }))
}
export function decodeTaxAttributions(value: unknown): TaxAttribution[] {
  return attributions(value).map(entry => {
    const amount = decodeStoredMonetaryAmount(entry.amount)
    return { ...entry, type: String(entry.type), amount }
  })
}

// Validate the original request independently of numeric runtime/storage encoding.
export function validateSubmittedTaxAmounts(value: unknown): void {
  for (const entry of attributions(value)) decodeStoredMonetaryAmount(entry.amount)
}
