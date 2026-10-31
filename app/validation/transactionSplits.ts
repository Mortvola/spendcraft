import { addMoneyCents, type MoneyCents } from '#common/moneyCents'
import { monetaryAmountCents, checkedCentSum } from '#services/categoryAmountCodec'
import { Exception } from '@adonisjs/core/exceptions'

export function validateTransactionSplits(
  amount: number, categories: readonly { amount: number }[],
  message = 'The sum of the categories does not match the transaction amount.',
) {
  const total = checkedCentSum(categories.map((split) => monetaryAmountCents(split.amount)))
  const expected = monetaryAmountCents(amount)
  if (total !== expected) {
    throw new Exception(message, { status: 422 })
  }
}

export function validateCentTransactionSplits(
  amountCents: MoneyCents, categories: readonly { amountCents: MoneyCents }[],
  message = 'The sum of the categories does not match the transaction amount.',
) {
  if (addMoneyCents(...categories.map(split => split.amountCents)) !== amountCents) {
    throw new Exception(message, { status: 422 })
  }
}
