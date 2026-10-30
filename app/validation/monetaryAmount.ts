import vine from '@vinejs/vine'
import { decodeStoredMonetaryAmount } from '#services/categoryAmountCodec'
import { parseMoneyCents } from '#common/moneyCents'

const canonicalAmount = vine.createRule((value, options: { max?: number }, field) => {
  try {
    const amount = decodeStoredMonetaryAmount(value)
    if (options.max !== undefined && Math.abs(amount) > options.max) {
      field.report('The {{ field }} field exceeds the supported monetary range',
        'decimalMoneyRange', field)
    }
  }
  catch { field.report('The {{ field }} field must be a safe canonical two-decimal monetary string',
    'decimalMoney', field) }
})

// Request strings become numbers only after canonical format and cent safety validation.
export const monetaryAmount = (options: { max?: number } = {}) => vine.string().use(canonicalAmount(
  options)).transform(decodeStoredMonetaryAmount)

const canonicalCents = vine.createRule((value, _options: undefined, field) => {
  try { parseMoneyCents(value) }
  catch {
    field.report('The {{ field }} field must be a safe canonical two-decimal monetary string',
      'decimalMoney', field)
  }
})

export const monetaryCents = () => vine.string().use(canonicalCents()).transform(parseMoneyCents)
