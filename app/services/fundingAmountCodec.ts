import { formatMoneyCents, moneyCentsFromInteger, type MoneyCents } from '#common/moneyCents'
import { Exception } from '@adonisjs/core/exceptions'
import { monetaryAmountCents, encodeMonetaryAmount, decodeStoredMonetaryAmount } from
  './categoryAmountCodec.ts'

type Path = (string | number)[]
type Scalar = (value: unknown, path: Path) => unknown

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Exception('Invalid funding JSON object', { status: 422 })
  }
  return { ...value }
}

export function runtimeFundingAmount(value: unknown): number {
  const cents = monetaryAmountCents(value)
  if (typeof value ===
    'number') return value // Unsaved/runtime values retain their calculation precision.
  const result = cents / 100
  if (encodeMonetaryAmount(result) !== value) throw new Exception('Unsafe funding amount decoding',
    { status: 422 })
  return result
}

function leaf(row: Record<string, unknown>, key: string, scalar: Scalar, path: Path) {
  if (Object.hasOwn(row, key) && row[key] !== null && row[key] !== undefined) row[key] = scalar(row[
    key], [...path, key])
}

export function mapFundingRules(value: unknown, scalar: Scalar, path: Path = []): unknown {
  if (value === null || value === undefined) return value
  if (!Array.isArray(value)) throw new Exception('Funding rules must be an array', { status: 422 })
  return value.map((entry: unknown, index) => {
    const row = object(entry)
    // Both fixed dollars and percentage points use the approved scale, without changing mode flags.
    leaf(row, 'amount', scalar, [...path, index])
    return row
  })
}

export function mapFundingMetadata(value: unknown, scalar: Scalar): unknown {
  if (value === null || value === undefined) return value
  if (!Array.isArray(value)) throw new Exception('Funding allocations must be an array', {
    status: 422 })
  return value.map((entry: unknown, index) => {
    const row = object(entry)
    leaf(row, 'baseAmount', scalar, [index])
    if (Object.hasOwn(row, 'fundingCategories')) row.fundingCategories = mapFundingRules(row
      .fundingCategories, scalar, [index, 'fundingCategories'])
    return row
  })
}

export const encodeFundingRules = (value: unknown) => mapFundingRules(value, encodeMonetaryAmount)
export const decodeFundingRules = (value: unknown) => mapFundingRules(value,
  decodeStoredMonetaryAmount)
export const encodeFundingMetadata = (value: unknown) => transactionMetadata(value, 'encode')
export const decodeFundingMetadata = (value: unknown) => transactionMetadata(value, 'decode')
export const runtimeFundingMetadata = (value: unknown) => transactionMetadata(value, 'runtime')

// API money uses decimal strings; percentages retain their numeric meaning.
export function serializeFundingRules(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (!Array.isArray(value)) throw new Exception('Funding rules must be an array', { status: 422 })
  return value.map((entry: unknown) => {
    const row = object(entry)
    leaf(row, 'amount', row.percentage === true ? runtimeFundingAmount : encodeMonetaryAmount, [])
    return row
  })
}

export function serializeFundingMetadata(value: unknown): unknown {
  return transactionMetadata(value, 'serialize')
}

export type TransactionFundingRule = { categoryId: number } & (
  { percentage: true, amount?: number | null }
  | { percentage?: false | null, amountCents?: MoneyCents | null }
)
export interface TransactionFundingMetadata {
  baseAmountCents?: MoneyCents | null
  fundingCategories?: TransactionFundingRule[] | null
}
interface FundingRuleInput {
  categoryId: number
  percentage?: boolean | null
  amount?: number | null
}

// Request dollars are rounded once; percentage calculations retain their existing precision.
function fundingRulesToCents(value: readonly FundingRuleInput[] | null | undefined):
  TransactionFundingRule[] | null | undefined {
  if (value == null) return value
  return value.map(rule => {
    const { amount, percentage, ...metadata } = rule
    if (percentage === true) return { ...metadata, percentage,
      ...(Object.hasOwn(rule, 'amount') ? { amount: amount == null ? amount
        : runtimeFundingAmount(amount) } : {}) }
    return { ...metadata, ...(Object.hasOwn(rule, 'percentage') ? { percentage } : {}),
      ...(Object.hasOwn(rule, 'amount') ? { amountCents: amount == null ? amount
        : moneyCentsFromInteger(monetaryAmountCents(amount)) } : {}) }
  })
}

export function fundingMetadataToCents<T extends { categoryId: number, baseAmount?: number | null,
  fundingCategories?: readonly FundingRuleInput[] | null }>(rows: readonly T[]) {
  return rows.map(row => {
    const { baseAmount, fundingCategories, ...metadata } = row
    return { ...metadata,
      ...(Object.hasOwn(row, 'baseAmount') ? { baseAmountCents: baseAmount == null ? baseAmount
        : moneyCentsFromInteger(monetaryAmountCents(baseAmount)) } : {}),
      ...(Object.hasOwn(row, 'fundingCategories') ? {
        fundingCategories: fundingRulesToCents(fundingCategories),
      } : {}),
    }
  })
}

type MetadataOperation = 'decode' | 'encode' | 'runtime' | 'serialize'

function transactionMetadata(value: unknown, operation: MetadataOperation): unknown {
  if (value === null || value === undefined) return value
  if (!Array.isArray(value)) throw new Exception('Funding allocations must be an array', {
    status: 422 })
  const decode = operation === 'decode'
  const external = operation === 'encode' || operation === 'serialize'
  const money = (amount: unknown): unknown => {
    if (decode) {
      if (typeof amount !== 'string') throw new Exception(
        'Stored funding amount must be a canonical decimal string', { status: 422 })
      return moneyCentsFromInteger(monetaryAmountCents(amount))
    }
    if (typeof amount !== 'number') throw new Exception('Invalid funding cents', { status: 422 })
    const cents = moneyCentsFromInteger(amount)
    return external ? formatMoneyCents(cents) : cents
  }
  const move = (row: Record<string, unknown>, storedKey: string, runtimeKey: string) => {
    const source = decode ? storedKey : runtimeKey
    const target = external ? storedKey : runtimeKey
    if (source !== target && Object.hasOwn(row, target)) throw new Exception(
      'Conflicting funding metadata fields', { status: 422 })
    if (!decode && Object.hasOwn(row, storedKey)) throw new Exception(
      'Runtime funding metadata requires cents', { status: 422 })
    if (!Object.hasOwn(row, source)) return
    const amount = row[source]
    if (source !== target) Reflect.deleteProperty(row, source)
    row[target] = amount == null ? amount : money(amount)
  }
  return value.map(entry => {
    const row = object(entry)
    move(row, 'baseAmount', 'baseAmountCents')
    if (Object.hasOwn(row, 'fundingCategories') && row.fundingCategories != null) {
      if (!Array.isArray(row.fundingCategories)) throw new Exception(
        'Funding rules must be an array', { status: 422 })
      row.fundingCategories = row.fundingCategories.map(entry => {
        const rule = object(entry)
        if (rule.percentage === true) {
          if (Object.hasOwn(rule, 'amountCents')) throw new Exception(
            'Percentage funding rules require numeric percentages', { status: 422 })
          leaf(rule, 'amount', decode ? decodeStoredMonetaryAmount
            : operation === 'encode' ? encodeMonetaryAmount : runtimeFundingAmount, [])
        } else move(rule, 'amount', 'amountCents')
        return rule
      })
    }
    return row
  })
}
