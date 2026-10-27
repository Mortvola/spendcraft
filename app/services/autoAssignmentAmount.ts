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
