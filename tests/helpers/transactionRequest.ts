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
      return Object.hasOwn(entry, 'amount') ? { ...entry, amount: encode(Reflect.get(entry,
        'amount')) } : { ...entry }
    })
  }
  return result
}

// Funding/rebalance requests also carry monetary base amounts and fixed-dollar rules.
export function categoryTransferRequest(values: object): Record<string, unknown> {
  const result = transactionRequest({ ...values })
  if (Array.isArray(result.categories)) result.categories = result.categories.map((
    entry: unknown) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry
    const category = { ...entry }
    const baseAmount: unknown = Reflect.get(category, 'baseAmount')
    if (typeof baseAmount === 'number' && Number.isFinite(baseAmount) && Number.isSafeInteger(Math
      .round(baseAmount * 100))) {
      Reflect.set(category, 'baseAmount', encodeMonetaryAmount(baseAmount))
    }
    const rules: unknown = Reflect.get(category, 'fundingCategories')
    if (Array.isArray(rules)) Reflect.set(category, 'fundingCategories', rules.map((
      rule: unknown) => {
      if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) return rule
      const amount: unknown = Reflect.get(rule, 'amount')
      if (Reflect.get(rule, 'percentage') === false && typeof amount === 'number'
        && Number.isFinite(amount) && Number.isSafeInteger(Math.round(amount * 100))) return {
          ...rule, amount: encodeMonetaryAmount(amount) }
      return rule
    }))
    return category
  })
  return result
}
