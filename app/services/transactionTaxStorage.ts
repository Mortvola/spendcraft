import type Transaction from '#models/Transaction'
import { hasCategoryStorage, excluded as categoryExclusions } from './categoryStorageBinding.ts'
import { bindResolvedTaxStorage, excludeTaxStorage, hasTaxStorage, isTaxStorageExcluded,
  stageTaxStorage, enableTaxStorageWrite } from './taxStorageBinding.ts'
import {
  encodeTaxAttributions, validateSubmittedTaxAmounts, type TaxAttribution,
} from './taxAmountCodec.ts'

// Batch scope resolution: no global JSON consume hook, no per-entry queries.
// Tax reporting has no Transaction-type eligibility filter, so type 1 is not
// mislabeled as Loan and nondeprecated accountless history can still be read.
export async function bindTaxStorage(transactions: Transaction[], replacing =
  false): Promise<void> {
  const rows = transactions.filter(row => !hasTaxStorage(row) && !isTaxStorageExcluded(row)
    && row.budgetId !== undefined && (replacing || row.taxes !== undefined))
  if (!rows.length) return
  const owner = rows[0].$trx
  if (rows.some(row => row.$trx !== owner)) throw new Error(
    'Tax storage requires one owning transaction')
  for (const row of rows) {
    // New rows need an explicitly resolved active lifecycle, rather than assuming
    // missing Account links prove nondeprecated ownership before they're created.
    if (!row.$isPersisted && !hasCategoryStorage(row)) continue
    bindResolvedTaxStorage(row)
  }
}

// Called after Budget/Account/Category authorization, before financial mutation.
export async function prepareTaxReplacement(row: Transaction, entries: TaxAttribution[],
  rawInput: unknown): Promise<TaxAttribution[]> {
  await bindTaxStorage([row], true)
  const replacement = entries.filter(entry => entry.type !== '').map(entry => ({ type: entry.type,
    amount: entry.amount }))
  if (hasTaxStorage(row)) {
    validateSubmittedTaxAmounts(rawInput)
    encodeTaxAttributions(replacement)
  }
  return replacement
}

export async function prepareTaxStorageSave(row: Transaction): Promise<void> {
  if (!Object.hasOwn(row.$dirty, 'taxes')) { stageTaxStorage(row); return }
  if (categoryExclusions.has(row)) { excludeTaxStorage(row); return }
  // An active new lifecycle can have tax values before hydration. Enabling the
  // write must not hydrate originals and erase its already dirty replacement.
  if (!hasTaxStorage(row) && !isTaxStorageExcluded(row) && hasCategoryStorage(
    row)) enableTaxStorageWrite(row)
  stageTaxStorage(row)
}
