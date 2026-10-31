import vine from '@vinejs/vine'
import { decodeStoredMonetaryAmount } from '#services/categoryAmountCodec'
import { Exception } from '@adonisjs/core/exceptions'
import { parseMoneyCents, formatMoneyCents } from '#common/moneyCents'

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

// Search accepts ordinary decimal text, but never rounds an equality filter.
export function transactionSearchAmount(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return undefined
    const match = /^([+-]?)(?:(\d+)(?:\.(\d{0,2}))?|\.(\d{1,2}))$/.exec(text)
    if (match) {
      const whole = (match[2] ?? '0').replace(/^0+(?=\d)/, '')
      const fraction = (match[3] ?? match[4] ?? '').padEnd(2, '0')
      const negative = match[1] === '-' && (whole !== '0' || fraction !== '00')
      try { return formatMoneyCents(parseMoneyCents(`${negative ? '-' : ''}${whole}.${fraction}`)) }
      catch { /* Report unsafe values using the same validation response as malformed input. */ }
    }
  }
  throw new Exception('Amount search must be a safe decimal with at most two decimal places',
    { status: 422 })
}
