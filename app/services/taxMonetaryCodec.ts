import { Exception } from '@adonisjs/core/exceptions'
import { encodeMonetaryAmount, decodeStoredMonetaryAmount } from './categoryAmountCodec.ts'

export const taxForecastFields = ['taxableInterest', 'qualifiedDividends', 'ordinaryDividends',
  'taxableIraDistributions', 'taxablePensionAndAnnuities', 'taxableSocialSecurityBenefits',
  'additionalTaxableIncome', 'shortTermCapitalGains', 'longTermCapitalGains',
    'qualifiedBusinessIncomeDeduction'] as const
export const taxEstimatedFields = ['expectedAgi', 'priorYearAgi', 'priorYearTotalTax'] as const
export const taxForecastPaths = [...taxForecastFields.map(f => [f]), ...taxEstimatedFields.map(f =>
  ['estimated', f])]
export const transactionLogMoneyPaths = [['amount', 'old'], ['amount', 'new']]

export function monetaryObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Exception(
    'Invalid Tax monetary object', { status: 422 })
  return { ...value }
}
export function runtimeTaxMonetaryAmount(value: unknown): number {
  if (typeof value !== 'number') throw new Exception('Expected numeric Tax model amount', {
    status: 422 })
  encodeMonetaryAmount(value) // Validate without rounding the runtime value.
  return value
}
// Only this project's 15 allowlisted leaves are visited; other JSON is not normalized.
export function mapTaxMoney(value: unknown, paths: string[][], scalar: (value: unknown) =>
  unknown): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return value
  const result = monetaryObject(value)
  for (const path of paths) {
    const parent = path.length === 1 ? result : result[path[0]]
    if (parent === null || parent === undefined) continue
    const container = monetaryObject(parent), key = path[path.length - 1]
    if (!Object.hasOwn(container, key)) continue
    if (container[key] !== null && container[key] !== undefined) container[key] = scalar(container[
      key])
    if (path.length === 1) result[key] = container[key]
    else result[path[0]] = container
  }
  return result
}
export const encodeTaxForecast = (value: unknown) => mapTaxMoney(value, taxForecastPaths,
  encodeMonetaryAmount)
export const decodeTaxForecast = (value: unknown) => mapTaxMoney(value, taxForecastPaths,
  decodeStoredMonetaryAmount)
export const encodeTransactionLogMoney = (value: unknown) => mapTaxMoney(value,
  transactionLogMoneyPaths, encodeMonetaryAmount)
export const decodeTransactionLogMoney = (value: unknown) => mapTaxMoney(value,
  transactionLogMoneyPaths, decodeStoredMonetaryAmount)

export const serializeTaxForecast = (value: unknown) => mapTaxMoney(value, taxForecastPaths,
  amount => encodeMonetaryAmount(runtimeTaxMonetaryAmount(amount)))
export const serializeTransactionLogMoney = (value: unknown) => mapTaxMoney(value,
  transactionLogMoneyPaths, amount => encodeMonetaryAmount(runtimeTaxMonetaryAmount(amount)))

export function validateSubmittedTaxForecast(value: unknown): void {
  if (value === null ||
    value === undefined) return // Existing required-object validator decides presence.
  mapTaxMoney(value, taxForecastPaths, decodeStoredMonetaryAmount)
}
