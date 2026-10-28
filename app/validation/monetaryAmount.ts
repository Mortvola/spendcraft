import vine from '@vinejs/vine'
import { decodeStoredMonetaryAmount } from '#services/categoryAmountCodec'

const canonicalAmount = vine.createRule((value, _options: undefined, field) => {
  try { decodeStoredMonetaryAmount(value) }
  catch { field.report('The {{ field }} field must be a safe canonical two-decimal monetary string', 'decimalMoney', field) }
})

// Request strings become numbers only after canonical format and cent safety validation.
export const monetaryAmount = () => vine.string().use(canonicalAmount()).transform(decodeStoredMonetaryAmount)
