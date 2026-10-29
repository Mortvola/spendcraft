import { encodeMonetaryAmount } from '#services/categoryAmountCodec'

// Existing numeric fixtures model UI inputs; encode only the Statement wire amounts.
export function statementRequest(values: Record<string, unknown>): Record<string, unknown> {
  const result = { ...values }
  for (const field of ['startingBalance', 'endingBalance']) {
    if (typeof result[field] === 'number') result[field] = encodeMonetaryAmount(result[field])
  }
  if (result.data !== null && typeof result.data === 'object' && !Array.isArray(result.data)) {
    const data = { ...result.data }
    for (const field of ['shortTermCapitalGains', 'longTermCapitalGains', 'dividends',
      'taxableInterest']) {
      const value = Reflect.get(data, field)
      if (typeof value === 'number') Reflect.set(data, field, encodeMonetaryAmount(value))
    }
    result.data = data
  }
  return result
}
