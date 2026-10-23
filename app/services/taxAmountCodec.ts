import { Exception } from '@adonisjs/core/exceptions'
import { categoryAmountCents, storedCategoryAmount } from './categoryAmountCodec.ts'

export interface TaxAttribution { type: string; amount: number }

function invalid(message = 'Invalid tax attribution amount'): never {
  throw new Exception(message, { status: 422 })
}

export function taxAmountCents(value: unknown): number {
  try { return categoryAmountCents(value) } catch (error) {
    if (error instanceof Exception && error.status === 422) invalid()
    throw error
  }
}
export function storedTaxAmount(value: unknown): string {
  try { return storedCategoryAmount(value) } catch (error) {
    if (error instanceof Exception && error.status === 422) invalid()
    throw error
  }
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
  return attributions(value).map(entry => ({ ...entry, amount: storedTaxAmount(entry.amount) }))
}
export function decodeTaxAttributions(value: unknown): TaxAttribution[] {
  return attributions(value).map(entry => {
    const cents = taxAmountCents(entry.amount)
    // Legacy numeric reads retain their exact existing JS value, including subcents.
    const amount = typeof entry.amount === 'number' ? entry.amount : cents / 100
    if (typeof entry.amount === 'string' && taxAmountCents(amount) !== cents) invalid('Unsafe tax amount decoding')
    return { ...entry, type: String(entry.type), amount }
  })
}

// Vine already accepts numeric strings. Retain decimal/exponent strings, but never
// let booleans, blanks, hex, objects or missing amounts silently become money.
export function validateSubmittedTaxAmounts(value: unknown): void {
  for (const entry of attributions(value)) {
    const amount = entry.amount
    if (typeof amount === 'number') { storedTaxAmount(amount); continue }
    if (typeof amount !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(amount.trim())) invalid()
    storedTaxAmount(Number(amount))
  }
}
