import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { formatMoneyCents } from '#common/moneyCents'
// Characterization of current functions only: no migration implementation or DB bootstrap.
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { fundingCategoryEffectCents } from '../../client-src/Funding/calculateFunding.ts'
import { addMoneyCents, subtractMoneyCents, parseMoneyCents } from '../../common/moneyCents.ts'

async function current(file, name, context = {}) {
  const source = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let expression
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = `(${node.getText(
      ast).replace(/^export\s+/, '')})`
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = `(${node
      .initializer.getText(ast)})`
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) {
      expression = `(async function(${node.parameters.map((p) => p.getText(ast)).join(',')}) ${node
        .body.getText(ast)})`
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!expression) throw new Error(`Current function not found: ${file}:${name}`)
  return runInNewContext(ts.transpileModule(expression, { compilerOptions: { target: ts.ScriptTarget
    .ES2022 } }).outputText, { ...context, addMoneyCents, subtractMoneyCents, parseMoneyCents,
    formatMoneyCents, encodeMonetaryAmount })
}

test.group('Current Transaction Category string compatibility — no DB', () => {
  test('funding effect sums integer cents for the selected category')
    .with([['0.10', '0.20', '0.30'], ['-0.10', '-0.20', '-0.30'], ['0.10', '-0.10', '0.00']])
    .run(async ({ assert }, [a, b, expected]) => {
      const rows = [{ categoryId: 1, amountCents: parseMoneyCents(a) },
        { categoryId: 2, amountCents: parseMoneyCents('99.00') },
        { categoryId: 1, amountCents: parseMoneyCents(b) }]
      assert.strictEqual(fundingCategoryEffectCents(rows, 1), parseMoneyCents(expected))
      assert.strictEqual(fundingCategoryEffectCents(rows, 3), parseMoneyCents('0.00'))
    })
  test('funding effect rejects storage strings and invalid cent values', ({ assert }) => {
    for (const amountCents of ['10.00', 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => fundingCategoryEffectCents([{ categoryId: 1, amountCents }], 1),
        'Invalid monetary cents')
    }
  })
  test('replacement admission currently accepts numeric allocations only').with([10, '10.00'])
    .run(async ({ assert }, amount) => {
      const accepts = await current('app/Controllers/Http/CategoriesController.ts',
        'hasReplacementAllocations')
      assert.equal(accepts([{ categoryId: 1, amount }]), typeof amount === 'number')
    })
  test('opening writes a positive same-sign Pool allocation and keeps Account balance')
    .with(['new', 'numeric-existing', 'string-existing'])
    .run(async ({ assert }, scenario) => {
      const owner = {}, date = { toISODate: () => '2025-01-01' }
      let row, link, queries = 0, saves = 0
      const pool = { id: 99, balanceCents: parseMoneyCents('5.00') }
      const existing = { id: 3, amount: 75, merge(values) { Object.assign(this, values);
        return this },
        async save() { return this }, related() { return { query: () => ({ firstOrFail: async () =>
          row }) } } }
      if (scenario !== 'new') row = { categories: [{ categoryId: 99, amount: scenario ===
        'string-existing' ? '75.00' : 75, comment: 'keep' }],
        merge(values) { Object.assign(this, values); return this }, async save() { saves++;
          return this } }
      class Transaction {
        useTransaction(trx) { assert.strictEqual(trx, owner); return this }
        fill(values) { Object.assign(this, values); return this }
        async save() { saves++; this.id = 7; row = { ...this }; return this }
      }
      const account = { id: 1, balanceCents: parseMoneyCents(encodeMonetaryAmount(100)),
        tracking: 'Transactions', startDate: date, $trx: owner,
        related: () => ({ query: () => ({ whereHas() { return this }, where() { return this }, sum(
          ) { return this },
          async first() { return queries++ === 0 ? { $extras: { sum: '25.00' } } : scenario ===
            'new' ? null : existing },
        }), async create(values) { link = values; return values } }),
      }
      const update = await current('app/Models/Account.ts', 'updateStartingBalance', {
        requestCategoryStorage: (model) => model, validateStoredCategoryConservation: async () =>
          undefined,
        AccountType: { Loan: 'loan' }, Transaction, TrackingType: { Balances: 'Balances' },
          TransactionType: { STARTING_BALANCE: 4 }, logger: { info: () => undefined },
      })
      await update.call(account, { id: 2 }, pool)
      assert.equal(Number(formatMoneyCents(account.balanceCents)), 100)
      assert.equal(row.categories[0].categoryId, 99)
      assert.strictEqual(row.categories[0].amount, 75)
      if (scenario === 'new') {
        assert.equal(row.type, 4); assert.strictEqual(row.date, date)
        assert.equal(link.amount, 75); assert.equal(pool.balanceCents, parseMoneyCents(
          '80.00')); assert.equal(saves, 1)
      } else {
        assert.equal(pool.balanceCents, parseMoneyCents('5.00')); assert.equal(
          row.categories[0].comment, 'keep'); assert
          .equal(saves, 2)
      }
    })
})
