import { Exception } from '@adonisjs/core/exceptions'

export function validateTransactionSplits(
  amount: number, categories: readonly { amount: number }[],
  message = 'The sum of the categories does not match the transaction amount.',
) {
  // Match the dialog's per-split cent rounding before applying the transaction sign.
  const sign = amount < 0 ? -1 : 1
  const total = categories.reduce((sum, split) => sum + Math.round(split.amount * sign * 100), 0)
  if (total !== Math.round(Math.abs(amount) * 100)) {
    throw new Exception(message, { status: 422 })
  }
}
