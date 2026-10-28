import vine from '@vinejs/vine'
import { decodeStoredMonetaryAmount } from '#services/categoryAmountCodec'

const canonicalAmount = vine.createRule((value, options: { max?: number }, field) => {
  try {
    const amount = decodeStoredMonetaryAmount(value)
    if (options.max !== undefined && Math.abs(amount) > options.max) {
      field.report('The {{ field }} field exceeds the supported monetary range', 'decimalMoneyRange', field)
    }
  }
  catch { field.report('The {{ field }} field must be a safe canonical two-decimal monetary string', 'decimalMoney', field) }
})

// Request strings become numbers only after canonical format and cent safety validation.
export const monetaryAmount = (options: { max?: number } = {}) => vine.string().use(canonicalAmount(options)).transform(decodeStoredMonetaryAmount)
