import { Exception } from '@adonisjs/core/exceptions'
import { encodeMonetaryAmount, decodeStoredMonetaryAmount } from './categoryAmountCodec.ts'

export const statementIncomeFields = ['shortTermCapitalGains', 'longTermCapitalGains', 'dividends', 'taxableInterest'] as const
export type StatementIncomeData = Partial<Record<typeof statementIncomeFields[number], number | null>> & Record<string, unknown>

function invalid(): never { throw new Exception('Invalid Statement income amount', { status: 422 }) }

export function incomeObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  return { ...value }
}
export function runtimeStatementIncomeAmount(value: unknown): number {
  if (typeof value !== 'number') invalid()
  encodeMonetaryAmount(value) // Validate without rounding the runtime value.
  return value
}
function mapStatementIncome(value: unknown, scalar: (value: unknown) => number): StatementIncomeData | null | undefined {
  if (value === null || value === undefined) return value
  const result = incomeObject(value)
  // Construct known keys with their validated types, preserving missing/null leaves.
  const income: StatementIncomeData = { ...result }
  for (const field of statementIncomeFields) {
    if (Object.hasOwn(result, field)) income[field] = result[field] === null ? null : scalar(result[field])
  }
  return income
}
export const decodeStatementIncome = (value: unknown) => mapStatementIncome(value, decodeStoredMonetaryAmount)
export const serializeStatementIncome = (value: unknown) => mapStatementIncome(value, runtimeStatementIncomeAmount)

export function serializeStatementIncomeResponse(value: unknown): Record<string, unknown> | null | undefined {
  const result = serializeStatementIncome(value)
  if (result === null || result === undefined) return result
  const response: Record<string, unknown> = { ...result }
  for (const field of statementIncomeFields) {
    if (Object.hasOwn(result, field) && result[field] !== null) response[field] = encodeMonetaryAmount(result[field])
  }
  return response
}

export function encodeStatementIncome(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return value
  const result = incomeObject(value)
  for (const field of statementIncomeFields) {
    if (Object.hasOwn(result, field)) result[field] = encodeMonetaryAmount(result[field])
  }
  return result
}

// Validate raw request leaves without numeric coercion. Optional-object semantics stay with Vine.
export function validateSubmittedStatementIncome(value: unknown): void {
  if (value === null || value === undefined) return
  const data = incomeObject(value)
  for (const field of statementIncomeFields) decodeStoredMonetaryAmount(data[field])
}
