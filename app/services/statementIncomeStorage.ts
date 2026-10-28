import type { LucidRow } from '@adonisjs/lucid/types/model'
import { isDeepStrictEqual } from 'node:util'
import { decodeStatementIncome, encodeStatementIncome, incomeObject, statementIncomeFields } from './statementIncomeCodec.ts'
import { encodeMonetaryAmount } from './categoryAmountCodec.ts'

const originals = new WeakMap<object, unknown>()
const pending = new WeakMap<object, unknown>()
const replacements = new WeakSet<object>()

export function consumeStatementIncome(value: unknown, row: LucidRow) {
  const decoded = decodeStatementIncome(value)
  originals.set(row, structuredClone(value))
  return decoded
}
export function replaceStatementIncome(row: LucidRow, value: unknown): void {
  // Preserve unrelated stored properties when replacing the four submitted leaves.
  const data = { ...(row.$attributes.data ?? {}), ...incomeObject(value) }
  encodeStatementIncome(data) // Validate all values before mutation/persistence.
  row.$attributes.data = data
  replacements.add(row)
}
export function stageStatementIncomeSave(row: LucidRow): void {
  pending.delete(row)
  if (replacements.has(row)) {
    // Explicit replacement must persist strings even when numeric values match
    // clean legacy originals. Temporary storage values are decoded after success.
    row.$attributes.data = encodeStatementIncome(row.$attributes.data)
    replacements.delete(row)
  }
}
export function prepareStatementIncome(value: unknown, row: LucidRow): string | null | undefined {
  if (value === null || value === undefined) { pending.set(row, value); return value }
  const encoded = incomeObject(value)
  const original = originals.get(row)
  const decodedOriginal = decodeStatementIncome(original)
  const rawOriginal = original === null || original === undefined ? null : incomeObject(original)
  for (const field of statementIncomeFields) {
    if (!Object.hasOwn(encoded, field)) continue
    // Changes confined to other JSON properties must not normalize historical
    // income leaves, including nulls and fractional-cent numeric values.
    if (row.$isPersisted && rawOriginal && Object.hasOwn(rawOriginal, field)
      && isDeepStrictEqual(encoded[field], decodedOriginal?.[field])) encoded[field] = rawOriginal[field]
    else encoded[field] = encodeMonetaryAmount(encoded[field])
  }
  pending.set(row, structuredClone(encoded))
  return JSON.stringify(encoded)
}
export function finishStatementIncomeSave(row: LucidRow): void {
  if (!pending.has(row)) return
  const raw = pending.get(row)
  const decoded = decodeStatementIncome(raw)
  row.$attributes.data = decoded
  row.$original.data = structuredClone(decoded)
  originals.set(row, structuredClone(raw))
  pending.delete(row)
}
