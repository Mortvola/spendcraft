import type Transaction from '#models/Transaction'
import db from '@adonisjs/lucid/services/db'
import { hasCategoryStorage, excluded as categoryExclusions } from './categoryStorageBinding.ts'
import { bindResolvedTaxStorage, excludeTaxStorage, hasTaxStorage, isTaxStorageExcluded, stageTaxStorage, enableTaxStorageWrite } from './taxStorageBinding.ts'
import { encodeTaxAttributions, validateSubmittedTaxAmounts } from './taxAmountCodec.ts'
import type { TaxAttribution } from './taxAmountCodec.ts'

// Batch scope resolution: no global JSON consume hook, no per-entry queries.
// Tax reporting has no Transaction-type eligibility filter, so type 1 is not
// mislabeled as Loan and nondeprecated accountless history can still be read.
export async function bindTaxStorage(transactions: Transaction[], replacing = false): Promise<void> {
  const rows = transactions.filter(row => !hasTaxStorage(row) && !isTaxStorageExcluded(row)
    && row.budgetId !== undefined && (replacing || row.taxes !== undefined))
  if (!rows.length) return
  const owner = rows[0].$trx
  if (rows.some(row => row.$trx !== owner)) throw new Error('Tax storage requires one owning transaction')
  const unresolved = rows.filter(row => !hasCategoryStorage(row))
  const ids = unresolved.filter(row => row.$isPersisted).map(row => row.id)
  const links = ids.length ? await db.from('account_transactions as at')
    .if(owner, query => { if (owner) query.useTransaction(owner) })
    .join('accounts as a', 'a.id', 'at.account_id').whereIn('at.transaction_id', ids)
    .select('at.transaction_id', 'a.type') : []
  const categoryIds = [...new Set(unresolved.flatMap(row => Array.isArray(row.categories)
    ? row.categories.map(category => category.categoryId) : []))]
  const loanCategories = categoryIds.length ? await db.from('categories')
    .if(owner, query => { if (owner) query.useTransaction(owner) })
    .whereIn('id', categoryIds).where('type', 'LOAN').select('id') : []
  const loanIds = new Set(links.filter(link => link.type === 'loan').map(link => Number(link.transaction_id)))
  const loanCategoryIds = new Set(loanCategories.map(category => Number(category.id)))
  for (const row of rows) {
    if (loanIds.has(row.id) || (Array.isArray(row.categories) && row.categories.some(category => loanCategoryIds.has(category.categoryId)))) {
      excludeTaxStorage(row); continue
    }
    // New rows need an explicitly resolved active lifecycle, rather than assuming
    // missing Account links prove nondeprecated ownership before they're created.
    if (!row.$isPersisted && !hasCategoryStorage(row)) continue
    bindResolvedTaxStorage(row)
  }
}

// Called after Budget/Account/Category authorization, before financial mutation.
export async function prepareTaxReplacement(row: Transaction, entries: TaxAttribution[], rawInput: unknown): Promise<TaxAttribution[]> {
  await bindTaxStorage([row], true)
  const replacement = entries.filter(entry => entry.type !== '').map(entry => ({ type: entry.type, amount: entry.amount }))
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
  if (!hasTaxStorage(row) && !isTaxStorageExcluded(row) && hasCategoryStorage(row)) enableTaxStorageWrite(row)
  stageTaxStorage(row)
}
