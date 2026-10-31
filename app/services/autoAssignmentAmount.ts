import { formatMoneyCents, parseMoneyCents, moneyCentsFromInteger, type MoneyCents } from
  '#common/moneyCents'
import { Exception } from '@adonisjs/core/exceptions'

// Percentage points and fixed dollars share scale, not allocation semantics.
export function roundAutoAssignmentAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 9999999999.99) {
    throw new Exception('Invalid auto-assignment amount', { status: 422 })
  }
  const cents = Math.round(value * 100)
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 999999999999) {
    throw new Exception('Auto-assignment amount exceeds numeric(12,2)', { status: 422 })
  }
  return cents === 0 ? 0 : cents / 100
}

export type AutoAssignmentAmount = { percentage: true, amount: number }
  | { percentage: false, amountCents: MoneyCents }

export function autoAssignmentAmount(value: unknown, percentage: boolean | null = false):
  AutoAssignmentAmount {
  const rounded = roundAutoAssignmentAmount(value)
  return percentage === true ? { percentage: true, amount: rounded }
    : { percentage: false, amountCents: parseMoneyCents(rounded.toFixed(2)) }
}

export function storedAutoAssignmentAmount(value: unknown): string {
  const cents = parseMoneyCents(value)
  if (Math.abs(cents) > 999999999999) throw new Exception(
    'Auto-assignment amount exceeds numeric(12,2)', { status: 422 })
  return formatMoneyCents(cents)
}

export function encodeAutoAssignmentAmount(value: AutoAssignmentAmount): string {
  return value.percentage ? roundAutoAssignmentAmount(value.amount).toFixed(2)
    : storedAutoAssignmentAmount(formatMoneyCents(value.amountCents))
}

// Multiply cents by hundredths of a percentage point exactly. BigInt division truncates
// toward zero; ties round toward positive infinity, matching Math.round (including negatives).
export function autoAssignmentPercentageCents(baseCents: MoneyCents, percentage: number):
  MoneyCents {
  const base = BigInt(moneyCentsFromInteger(baseCents))
  const units = BigInt(parseMoneyCents(roundAutoAssignmentAmount(percentage).toFixed(2)))
  const product = base * units
  const quotient = product / 10000n
  const remainder = product % 10000n
  const rounded = quotient + (remainder >= 5000n ? 1n : remainder < -5000n ? -1n : 0n)
  return moneyCentsFromInteger(Number(rounded))
}
