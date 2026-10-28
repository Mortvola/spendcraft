import type { LucidRow } from '@adonisjs/lucid/types/model'
import { isDeepStrictEqual } from 'node:util'
import { decodeTaxForecast, decodeTransactionLogMoney, encodeTaxForecast, monetaryObject,
  taxForecastPaths, transactionLogMoneyPaths } from './taxMonetaryCodec.ts'
import { encodeMonetaryAmount } from './categoryAmountCodec.ts'

const originals = new WeakMap<object, unknown>()
const pending = new WeakMap<object, unknown>()
const replacements = new WeakSet<object>()

function consume(value: unknown, row: LucidRow, property: 'data' | 'changes') {
  const decoded = property === 'data' ? decodeTaxForecast(value) : decodeTransactionLogMoney(value)
  originals.set(row, structuredClone(value))
  return decoded
}
export const consumeTaxForecast = (value: unknown, row: LucidRow) => consume(value, row, 'data')
export const consumeTransactionLogMoney = (value: unknown, row: LucidRow) => consume(value, row, 'changes')

export function replaceTaxForecast(row: LucidRow, value: unknown): void {
  const previous = row.$attributes.data === null || row.$attributes.data === undefined ? {} : monetaryObject(row.$attributes.data)
  const submitted = monetaryObject(value), result = { ...previous, ...submitted }
  if (Object.hasOwn(submitted, 'estimated') && submitted.estimated !== null && submitted.estimated !== undefined) {
    result.estimated = { ...(previous.estimated === null || previous.estimated === undefined ? {} : monetaryObject(previous.estimated)), ...monetaryObject(submitted.estimated) }
  }
  encodeTaxForecast(result) // Validate before changing the model.
  row.$attributes.data = result
  replacements.add(row)
}
export function stageTaxMoneySave(row: LucidRow): void {
  pending.delete(row)
  if (replacements.has(row)) {
    row.$attributes.data = encodeTaxForecast(row.$attributes.data)
    replacements.delete(row)
  }
}
function prepare(value: unknown, row: LucidRow, property: 'data' | 'changes'): string | null | undefined {
  if (value === null || value === undefined) {
    pending.set(row, value)
    // Preserve the log writer's JSON.stringify(null) semantics; omitted changes
    // still remain omitted/SQL NULL rather than manufacturing an object.
    return property === 'changes' && value === null ? 'null' : value
  }
  const result = monetaryObject(value), original = originals.get(row)
  const raw = original === null || original === undefined ? null : monetaryObject(original)
  const decoded = property === 'data' ? decodeTaxForecast(original) : decodeTransactionLogMoney(original)
  for (const path of property === 'data' ? taxForecastPaths : transactionLogMoneyPaths) {
    const parent = path.length === 1 ? result : result[path[0]]
    if (parent === null || parent === undefined) continue
    const container = monetaryObject(parent), key = path[path.length - 1]
    if (!Object.hasOwn(container, key)) continue
    const oldParent = path.length === 1 ? raw : raw?.[path[0]]
    const decodedParent = path.length === 1 ? decoded : decoded?.[path[0]]
    const old = oldParent === null || oldParent === undefined ? null : monetaryObject(oldParent)
    const oldDecoded = decodedParent === null || decodedParent === undefined ? null : monetaryObject(decodedParent)
    if (row.$isPersisted && old && Object.hasOwn(old, key) && isDeepStrictEqual(container[key], oldDecoded?.[key])) container[key] = old[key]
    else if (container[key] !== null && container[key] !== undefined) container[key] = encodeMonetaryAmount(container[key])
    if (path.length === 1) result[key] = container[key]
    else result[path[0]] = container
  }
  pending.set(row, structuredClone(result))
  return JSON.stringify(result)
}
export const prepareTaxForecast = (value: unknown, row: LucidRow) => prepare(value, row, 'data')
export const prepareTransactionLogMoney = (value: unknown, row: LucidRow) => prepare(value, row, 'changes')
export function finishTaxMoneySave(row: LucidRow, property: 'data' | 'changes'): void {
  if (!pending.has(row)) return
  const raw = pending.get(row), decoded = property === 'data' ? decodeTaxForecast(raw) : decodeTransactionLogMoney(raw)
  row.$attributes[property] = decoded
  row.$original[property] = structuredClone(decoded)
  originals.set(row, structuredClone(raw)); pending.delete(row)
}
