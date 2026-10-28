import { encodeMonetaryAmount } from '#services/categoryAmountCodec'

// Encode successful numeric UI fixtures at the Category request boundary only.
export function categoryRequest(values: object): Record<string, unknown> {
  const result: Record<string, unknown> = { ...values }
  if (typeof result.fundingAmount === 'number') result.fundingAmount = encodeMonetaryAmount(result.fundingAmount)
  if (Array.isArray(result.fundingCategories)) {
    result.fundingCategories = result.fundingCategories.map((rule: unknown) => {
      if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) return rule
      const amount: unknown = Reflect.get(rule, 'amount')
      if (Reflect.get(rule, 'percentage') === false && typeof amount === 'number') return { ...rule, amount: encodeMonetaryAmount(amount) }
      if (Reflect.get(rule, 'percentage') === true && typeof amount === 'string' && amount.trim() !== '' && Number.isFinite(Number(amount))) return { ...rule, amount: Number(amount) }
      return rule
    })
  }
  return result
}
