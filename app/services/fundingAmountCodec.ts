import { Exception } from '@adonisjs/core/exceptions'
import { categoryAmountCents, storedCategoryAmount, decodeStoredMonetaryAmount } from './categoryAmountCodec.ts'

type Path = (string | number)[]
type Scalar = (value: unknown, path: Path) => unknown

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Exception('Invalid funding JSON object', { status: 422 })
  }
  return { ...value }
}

export function runtimeFundingAmount(value: unknown): number {
  const cents = categoryAmountCents(value)
  if (typeof value === 'number') return value // Unsaved/runtime values retain their calculation precision.
  const result = cents / 100
  if (storedCategoryAmount(result) !== value) throw new Exception('Unsafe funding amount decoding', { status: 422 })
  return result
}

function leaf(row: Record<string, unknown>, key: string, scalar: Scalar, path: Path) {
  if (Object.hasOwn(row, key) && row[key] !== null && row[key] !== undefined) row[key] = scalar(row[key], [...path, key])
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
  if (!Array.isArray(value)) throw new Exception('Funding allocations must be an array', { status: 422 })
  return value.map((entry: unknown, index) => {
    const row = object(entry)
    leaf(row, 'baseAmount', scalar, [index])
    if (Object.hasOwn(row, 'fundingCategories')) row.fundingCategories = mapFundingRules(row.fundingCategories, scalar, [index, 'fundingCategories'])
    return row
  })
}

export const encodeFundingRules = (value: unknown) => mapFundingRules(value, storedCategoryAmount)
export const decodeFundingRules = (value: unknown) => mapFundingRules(value, decodeStoredMonetaryAmount)
export const encodeFundingMetadata = (value: unknown) => mapFundingMetadata(value, storedCategoryAmount)
export const decodeFundingMetadata = (value: unknown) => mapFundingMetadata(value, decodeStoredMonetaryAmount)

export const runtimeFundingMetadata = (value: unknown) => mapFundingMetadata(value, runtimeFundingAmount)
