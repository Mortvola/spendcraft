import { monetaryAmountCents, checkedCentSum } from '#services/categoryAmountCodec'
import { Exception } from '@adonisjs/core/exceptions'

export function validateTransactionSplits(
  amount: number, categories: readonly { amount: number }[],
  message = 'The sum of the categories does not match the transaction amount.',
  categoryStorage = false,
) {
  // Active storage callers opt into signed checked rounding; deprecated shared callers retain their existing policy.
  const sign = amount < 0 ? -1 : 1
  const total = categoryStorage
    ? checkedCentSum(categories.map((split) => monetaryAmountCents(split.amount)))
    : categories.reduce((sum, split) => sum + Math.round(split.amount * sign * 100), 0)
  const expected = categoryStorage ? monetaryAmountCents(amount) : Math.round(Math.abs(amount) * 100)
  if (total !== expected) {
    throw new Exception(message, { status: 422 })
  }
}
