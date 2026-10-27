import { Exception } from '@adonisjs/core/exceptions'
import { categoryAmountCents, storedCategoryAmount } from './categoryAmountCodec.ts'

export const taxForecastFields = ['taxableInterest', 'qualifiedDividends', 'ordinaryDividends',
  'taxableIraDistributions', 'taxablePensionAndAnnuities', 'taxableSocialSecurityBenefits',
  'additionalTaxableIncome', 'shortTermCapitalGains', 'longTermCapitalGains', 'qualifiedBusinessIncomeDeduction'] as const
export const taxEstimatedFields = ['expectedAgi', 'priorYearAgi', 'priorYearTotalTax'] as const
export const taxForecastPaths = [...taxForecastFields.map(f => [f]), ...taxEstimatedFields.map(f => ['estimated', f])]
export const transactionLogMoneyPaths = [['amount', 'old'], ['amount', 'new']]

export function monetaryObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Exception('Invalid Tax monetary object', { status: 422 })
  return { ...value }
}
export function storedTaxMonetaryAmount(value: unknown): string {
  return storedCategoryAmount(value)
}
export function runtimeTaxMonetaryAmount(value: unknown): number {
  const stored = storedTaxMonetaryAmount(value)
  if (typeof value === 'number') return value // Legacy reads never quantize.
  const result = categoryAmountCents(stored) / 100
  if (storedTaxMonetaryAmount(result) !== stored) throw new Exception('Unsafe Tax monetary decoding', { status: 422 })
  return result
}
// Only this project's 15 allowlisted leaves are visited; other JSON is not normalized.
export function mapTaxMoney(value: unknown, paths: string[][], scalar: (value: unknown) => unknown): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return value
  const result = monetaryObject(value)
  for (const path of paths) {
    const parent = path.length === 1 ? result : result[path[0]]
    if (parent === null || parent === undefined) continue
    const container = monetaryObject(parent), key = path[path.length - 1]
    if (!Object.hasOwn(container, key)) continue
    if (container[key] !== null && container[key] !== undefined) container[key] = scalar(container[key])
    if (path.length === 1) result[key] = container[key]
    else result[path[0]] = container
  }
  return result
}
export const encodeTaxForecast = (value: unknown) => mapTaxMoney(value, taxForecastPaths, storedTaxMonetaryAmount)
export const decodeTaxForecast = (value: unknown) => mapTaxMoney(value, taxForecastPaths, runtimeTaxMonetaryAmount)
export const encodeTransactionLogMoney = (value: unknown) => mapTaxMoney(value, transactionLogMoneyPaths, storedTaxMonetaryAmount)
export const decodeTransactionLogMoney = (value: unknown) => mapTaxMoney(value, transactionLogMoneyPaths, runtimeTaxMonetaryAmount)

export function validateSubmittedTaxForecast(value: unknown): void {
  if (value === null || value === undefined) return // Existing required-object validator decides presence.
  mapTaxMoney(value, taxForecastPaths, amount => {
    if (typeof amount === 'number') return storedTaxMonetaryAmount(amount)
    if (typeof amount !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(amount.trim())) {
      throw new Exception('Invalid Tax forecast amount', { status: 422 })
    }
    return storedTaxMonetaryAmount(Number(amount))
  })
}
