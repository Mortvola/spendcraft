import { Exception } from '@adonisjs/core/exceptions'

function invalid(message = 'Invalid Category allocation amount'): never {
  throw new Exception(message, { status: 422 })
}

export function checkedCentSum(values: readonly number[]): number {
  let sum = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(sum + value)) invalid('Unsafe Category allocation cent total')
    sum += value
  }
  return Object.is(sum, -0) ? 0 : sum
}

export function categoryAmountCents(value: unknown): number {
  if (typeof value === 'string') {
    if (value.length > 24 || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) || value === '-0.00') invalid()
    const negative = value.startsWith('-')
    const [whole, fraction] = value.replace(/^-/, '').split('.')
    const cents = (BigInt(whole) * 100n + BigInt(fraction)) * (negative ? -1n : 1n)
    if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) invalid()
    return Number(cents)
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid()
  const cents = Math.round(value * 100)
  if (!Number.isSafeInteger(cents)) invalid()
  return Object.is(cents, -0) ? 0 : cents
}

export function storedCategoryAmount(value: unknown): string {
  const cents = categoryAmountCents(value)
  const encoded = (cents / 100).toFixed(2)
  if (categoryAmountCents(encoded) !== cents) invalid('Category amount cannot be represented safely')
  return encoded
}

export function decodeStoredMonetaryAmount(value: unknown): number {
  if (typeof value !== 'string') invalid('Stored monetary amount must be a canonical decimal string')
  const cents = categoryAmountCents(value)
  const amount = cents / 100
  if (categoryAmountCents(amount) !== cents) invalid('Category amount cannot be decoded safely')
  return amount
}

function runtimeCategoryAmount(value: unknown): number {
  const cents = categoryAmountCents(value)
  if (typeof value === 'number') return value // Unsaved/runtime values retain their calculation precision.
  const number = cents / 100
  if (categoryAmountCents(number) !== cents) invalid('Category amount cannot be decoded safely')
  return number
}

export interface CategoryAllocation { categoryId: number; amount: number }

function allocations(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) invalid('Category allocations must be an array')
  return value.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)
      || !('categoryId' in entry) || !Number.isSafeInteger(entry.categoryId) || Number(entry.categoryId) <= 0) invalid()
    return { ...entry }
  })
}

export function runtimeCategoryAllocations(value: unknown): CategoryAllocation[] {
  return allocations(value).map((entry) => ({ ...entry, categoryId: Number(entry.categoryId), amount: runtimeCategoryAmount(entry.amount) }))
}

export function decodeCategoryAllocations(value: unknown): CategoryAllocation[] {
  return allocations(value).map(entry => ({ ...entry, categoryId: Number(entry.categoryId), amount: decodeStoredMonetaryAmount(entry.amount) }))
}

export function encodeCategoryAllocations(value: unknown) {
  return allocations(value).map((entry) => ({ ...entry, amount: storedCategoryAmount(entry.amount) }))
}

export function validateCategoryConservation(type: number, value: unknown, expected?: number, poolId?: number): void {
  const rows = allocations(value)
  const cents = rows.map((row) => categoryAmountCents(row.amount))
  const total = checkedCentSum(cents)
  if ([0, 4, 5].includes(type)) {
    if (expected === undefined || total !== categoryAmountCents(expected)) invalid('The sum of the categories does not match the transaction amount.')
  } else if (type === 2) {
    if (poolId === undefined || !rows.some((row) => row.categoryId === poolId)) invalid('Funding requires a Funding Pool allocation.')
    const pool = checkedCentSum(cents.filter((_, index) => rows[index].categoryId === poolId))
    const other = checkedCentSum(cents.filter((_, index) => rows[index].categoryId !== poolId))
    if (checkedCentSum([other, pool]) !== 0) invalid('The sum of the category transfer amounts must be zero.')
  } else if (type === 3) {
    if (total !== 0) invalid('The sum of the category transfer amounts must be zero.')
  } else invalid('Unsupported Category allocation lifecycle')
}

// Both JSON number and canonical decimal-string amounts use the same numeric comparison.
// A missing/malformed amount errors instead of silently becoming zero.
export const categoryNonzeroAllocationSql = `EXISTS (
  SELECT 1 FROM jsonb_array_elements(transactions.categories::jsonb) AS allocation(value)
  WHERE (allocation.value->>'categoryId')::integer = ?
    AND COALESCE(allocation.value->>'amount', 'invalid')::numeric <> 0
)`

// New nominal input uses the same numeric value that its encoded storage will expose.
// Metadata is copied without conversion; existing clean legacy reads do not call this.
export function canonicalCategoryAllocations<T extends CategoryAllocation>(rows: readonly T[]): T[] {
  return rows.map((row) => ({ ...row, amount: runtimeCategoryAmount(storedCategoryAmount(row.amount)) }))
}
