import { test } from '@japa/runner'
import { encodeMonetaryAmount } from '../../app/services/categoryAmountCodec.ts'
import { DateTime } from 'luxon'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { accountEligible, categoryEligible } from '../../app/services/transactionEligibility.ts'
import { validateTransactionSplits } from '../../app/validation/transactionSplits.ts'
import { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents } from
  '../../common/moneyCents.ts'

// Characterize the CURRENT forward CREATE→DELETE contradiction, not acceptance
// of that arithmetic. Actual method bodies, inert adapters, no app/model/DB boot.
async function method(file, name, globals) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest,
    true)
  const declaration = source.statements.find(ts.isClassDeclaration).members.find((node) => ts
    .isMethodDeclaration(node) && node.name.getText(source) === name)
  return runInNewContext(ts.transpileModule(`(async function(${declaration.parameters.map((p) => p
    .getText(source)).join(',')}) ${declaration.body.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { encodeMonetaryAmount, addMoneyCents, subtractMoneyCents, parseMoneyCents,
    formatMoneyCents, ...globals })
}

test.group('Final readiness forward deletion characterization without DB', () => {
  test('fresh current CREATE then DELETE: pre-start reversal differs from eligible roundtrip').with(
    [
    { date: '2025-01-31', amount: 10 }, { date: '2025-01-31', amount: -10 },
    { date: '2025-02-01', amount: 10 },
    { date: '2025-02-01', amount: 0.2, categoryBalance: 0.1 },
    { date: '2025-02-01', amount: 0.2, categoryBalance: 0.1, empty: true },
    { date: '2025-02-01', amount: -0.2, categoryBalance: -0.1 },
  ]).run(async ({ assert }, scenario) => {
    const events = []
    const trx = { async commit() { events.push('commit') }, async rollback() { events.push(
      'rollback') } }
    const initialBalance = scenario.categoryBalance ?? 0
    const category = { id: 1, type: 'Regular', balance: initialBalance, async save() { events.push(
      'category.save') } }
    let transaction, link
    function query(row) {
      return { where() { return this }, andWhere() { return this }, whereHas() { return this },
        forUpdate() { events.push('gate'); return this }, async firstOrFail() { return row } }
    }
    const initialAccountBalance = scenario.categoryBalance ?? 100
    const account = { id: 1, type: 'Depository', tracking: 'Transactions',
      balanceCents: parseMoneyCents(encodeMonetaryAmount(initialAccountBalance)),
      startDate: DateTime.fromISO('2025-02-01'), async save() { events.push('account.save') },
      related() { return { async create(values) { link = { ...values, accountId: 1,
        pending: false }; return link } } } }
    const budget = { id: 1, async getUnassignedCategory() { return category } }
    const user = { budgetId: 1, useTransaction() { events.push('bind') }, related() { return {
      query: () => query(budget) } } }
    class Transaction {
      useTransaction() { return this }
      fill(values) { Object.assign(this, values); this.id = 1; this.deleted = false; return this }
      related() { return { associate: async () => { transaction = { ...this, async save() { events
        .push('transaction.save') } } } } }
      async load() { return undefined }
      serialize() { return this }
      async save() { events.push('transaction.save') }
      static query() { return query(transaction) }
    }
    const globals = { requestCategoryStorage: (model) => model, excludeCategoryStorage: () =>
      undefined, hasCategoryStorage: () => true,
      validateStoredCategoryConservation: async () => undefined, accountEligible,
      categoryEligible, validateTransactionSplits, Transaction,
      Account: { query: () => query(account) }, AccountTransaction: { findBy: async () => link },
      Category: { query: () => query(category) }, budgetCategories: () => query(category),
      budgetAccounts: () => query(account), db: { transaction: async () => trx },
      AccountType: { Loan: 'Loan' }, CategoryType: { Loan: 'Loan' },
      TrackingType: { Transactions: 'Transactions', Balances: 'Balances' },
      TransactionType: { MANUAL_TRANSACTION: 5 }, addTransaction: {}, transactionFields: {},
    }
    const create = await method('app/Controllers/Http/AccountsController.ts', 'addTransaction',
      globals)
    await create({ auth: { user }, request: { params: () => ({ acctId: 1 }), validateUsing: async (
      ) => ({
      date: DateTime.fromISO(scenario.date), amount: scenario.amount, name: 'Current',
      categories: [{ categoryId: 1, amount: scenario.amount }],
    }) }, logger: { error(error) { events.push(error.message) } } })
    const eligible = scenario.date >= '2025-02-01'
    assert.strictEqual(Number(formatMoneyCents(account.balanceCents)),
      scenario.categoryBalance === 0.1 ? 0.3
      : scenario.categoryBalance === -0.1 ? -0.3 : 100 + (eligible ? scenario.amount : 0))
    assert.strictEqual(category.balance, scenario.categoryBalance === 0.1 ? 0.3
      : scenario.categoryBalance === -0.1 ? -0.3 : eligible ? scenario.amount : 0)
    // Exercise the existing Unassigned fallback for an empty historical split list.
    if (scenario.empty) transaction.categories = []
    const remove = await method('app/Controllers/Http/TransactionsController.ts', 'delete', globals)
    await remove({ auth: { user }, request: { params: () => ({ trxId: 1 }) }, logger: { error(
      error) { events.push(error.message) } } })
    assert.isTrue(transaction.deleted)
    assert.strictEqual(Number(formatMoneyCents(account.balanceCents)),
      eligible ? initialAccountBalance : 100 - scenario.amount)
    assert.strictEqual(category.balance, eligible ? initialBalance : -scenario.amount)
    assert.equal(events.filter((event) => event === 'gate').length, 2)
    assert.equal(events.filter((event) => event === 'commit').length, 2)
  })
})
