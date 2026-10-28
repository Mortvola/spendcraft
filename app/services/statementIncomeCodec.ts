import { Exception } from '@adonisjs/core/exceptions'
import { storedCategoryAmount, decodeStoredMonetaryAmount } from './categoryAmountCodec.ts'

export const statementIncomeFields = ['shortTermCapitalGains', 'longTermCapitalGains', 'dividends', 'taxableInterest'] as const
export type StatementIncomeData = Partial<Record<typeof statementIncomeFields[number], number | null>> & Record<string, unknown>

function invalid(): never { throw new Exception('Invalid Statement income amount', { status: 422 }) }

export function incomeObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  return { ...value }
}
export function storedStatementIncomeAmount(value: unknown): string {
  try { return storedCategoryAmount(value) } catch (error) {
    if (error instanceof Exception && error.status === 422) invalid()
    throw error
  }
}
export function runtimeStatementIncomeAmount(value: unknown): number {
  if (typeof value !== 'number') invalid()
  storedStatementIncomeAmount(value) // Validate without rounding the runtime value.
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

export function encodeStatementIncome(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return value
  const result = incomeObject(value)
  for (const field of statementIncomeFields) {
    if (Object.hasOwn(result, field)) result[field] = storedStatementIncomeAmount(result[field])
  }
  return result
}

// Preserve Vine's existing decimal numeric-string API contract, but reject
// unsupported coercions before they can become numbers (e.g. boolean -> 1).
export function validateSubmittedStatementIncome(value: unknown): void {
  if (value === null || value === undefined) return // Optional object: Vine treats null as omitted.
  const data = incomeObject(value)
  for (const field of statementIncomeFields) {
    const amount = data[field]
    if (typeof amount === 'number') { storedStatementIncomeAmount(amount); continue }
    if (typeof amount !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(amount.trim())) invalid()
    storedStatementIncomeAmount(Number(amount))
  }
}
