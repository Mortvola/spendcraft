import { bound, requested, excluded, bindResolvedCategoryStorage, stageCategoryStorage, excludeCategoryStorage } from './categoryStorageBinding.ts'
import type Transaction from '#models/Transaction'
import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import { stageFundingStorage } from './fundingStorage.ts'
import { validateCategoryConservation, categoryAmountCents, checkedCentSum, encodeCategoryAllocations } from './categoryAmountCodec.ts'

const supported = [0, 2, 3, 4, 5]

export async function bindCategoryStorage(transactions: Transaction[]): Promise<void> {
  const rows = transactions.filter((row) => !bound.has(row) && supported.includes(row.type)
    && row.categories !== undefined && row.budgetId !== undefined)
  if (!rows.length) return
  const owner = rows[0].$trx
  if (rows.some((row) => row.$trx !== owner)) throw new Error('Category storage requires one owning transaction')
  const ids = rows.filter((row) => row.$isPersisted).map((row) => row.id)
  const links = ids.length ? await db.from('account_transactions as at')
    .if(owner, (query) => { if (owner) query.useTransaction(owner) })
    .join('accounts as a', 'a.id', 'at.account_id').join('institutions as i', 'i.id', 'a.institution_id')
    .whereIn('at.transaction_id', ids).select('at.transaction_id', 'a.type', 'i.application_id') : []
  const categoryIds = [...new Set(rows.flatMap((row) => Array.isArray(row.categories)
    ? row.categories.map((split) => split.categoryId) : []))]
  const loanCategories = categoryIds.length ? await db.from('categories').if(owner, (query) => { if (owner) query.useTransaction(owner) })
    .whereIn('id', categoryIds).where('type', 'LOAN').select('id') : []
  const excludedCategories = new Set(loanCategories.map((row) => Number(row.id)))
  const linksByTransaction = new Map<number, typeof links>()
  for (const link of links) {
    const id = Number(link.transaction_id)
    const group = linksByTransaction.get(id) ?? []
    group.push(link)
    linksByTransaction.set(id, group)
  }
  for (const row of rows) {
    if (Array.isArray(row.categories) && row.categories.some((split) => excludedCategories.has(split.categoryId))) {
      excludeCategoryStorage(row); continue
    }
    const ownLinks = linksByTransaction.get(row.id) ?? []
    if (ownLinks.some((link) => link.type === 'loan')) { excludeCategoryStorage(row); continue }
    const active = row.$isPersisted
      ? ([2, 3].includes(row.type) ? ownLinks.length === 0
        : ownLinks.length === 1 && ownLinks[0].type !== 'loan' && Number(ownLinks[0].application_id) === row.budgetId)
      : requested.has(row)
    if (!active) continue
    bindResolvedCategoryStorage(row)
  }
}

export async function prepareNewCategoryStorage(transaction: Transaction): Promise<void> {
  if (requested.has(transaction) && !transaction.$trx) throw new Error('Category storage requires an owning transaction')
  if (requested.has(transaction)) await bindCategoryStorage([transaction])
  // A later submitted allocation can enter a deprecated shared branch; never encode it.
  if (bound.has(transaction) && Object.hasOwn(transaction.$dirty, 'categories')) {
    encodeCategoryAllocations(transaction.categories)
    const query = db.from('categories').whereIn('id', transaction.categories.map((row) => row.categoryId))
      .where('type', 'LOAN').select('id')
    if (transaction.$trx) query.useTransaction(transaction.$trx)
    if ((await query).length) { excludeCategoryStorage(transaction); return }
  }
  // Scalar validation before persistence; conservation is enforced at the final owning write boundary.
  if (transaction.$isPersisted && supported.includes(transaction.type) && !excluded.has(transaction)
    && !bound.has(transaction) && Object.hasOwn(transaction.$dirty, 'categories')) {
    throw new Exception('Unsupported Category allocation ownership.', { status: 422 })
  }
  // Resolve Loan exclusions before an explicit funding replacement encodes metadata.
  if (bound.has(transaction)) stageFundingStorage(transaction, 'categories')
  stageCategoryStorage(transaction)
}

export async function validateStoredCategoryConservation(transaction: Transaction): Promise<void> {
  if (!bound.has(transaction)) return
  if (!transaction.$trx) throw new Error('Category conservation requires an owning transaction')
  if ([0, 4, 5].includes(transaction.type)) {
    const links = await db.from('account_transactions as at').useTransaction(transaction.$trx)
      .join('accounts as a', 'a.id', 'at.account_id').join('institutions as i', 'i.id', 'a.institution_id')
      .where('at.transaction_id', transaction.id)
      .select(db.raw('at.amount::text AS amount'), 'i.application_id', 'a.type')
    if (links.length !== 1 || Number(links[0].application_id) !== transaction.budgetId || links[0].type === 'loan') {
      throw new Exception('Transaction requires one owning AccountTransaction.', { status: 422 })
    }
    // numeric(12,2) is within safe cent range; codec compares the exact decimal text, without Number parsing.
    const expectedCents = categoryAmountCents(String(links[0].amount))
    if (checkedCentSum(transaction.categories.map((split) => categoryAmountCents(split.amount))) !== expectedCents) {
      throw new Exception('The sum of the categories does not match the transaction amount.', { status: 422 })
    }
  } else if (transaction.type === 3) {
    validateCategoryConservation(3, transaction.categories)
  } else {
    const pools = await db.from('categories as c').useTransaction(transaction.$trx)
      .join('groups as g', 'g.id', 'c.group_id').where('g.application_id', transaction.budgetId)
      .where('c.type', 'FUNDING POOL').select('c.id')
    validateCategoryConservation(transaction.type, transaction.categories, undefined,
      pools.length === 1 ? Number(pools[0].id) : undefined)
  }
}
