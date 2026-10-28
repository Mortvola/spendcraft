import { encodeMonetaryAmount } from '#services/categoryAmountCodec'

// Numeric lifecycle fixtures model client state; encode only Transaction request money.
export function transactionRequest(values: Record<string, unknown>): Record<string, unknown> {
  const encode = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
    && Number.isSafeInteger(Math.round(value * 100)) ? encodeMonetaryAmount(value) : value
  const result = { ...values }
  for (const field of ['amount', 'principle']) {
    if (Object.hasOwn(result, field)) result[field] = encode(result[field])
  }
  for (const field of ['categories', 'taxCategories']) {
    if (Array.isArray(result[field])) result[field] = result[field].map((entry: unknown) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry
      return Object.hasOwn(entry, 'amount') ? { ...entry, amount: encode(Reflect.get(entry, 'amount')) } : { ...entry }
    })
  }
  return result
}
