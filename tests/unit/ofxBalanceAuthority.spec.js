import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { URL } from 'node:url'
import ts from 'typescript'
import { XMLParser } from 'fast-xml-parser'

// Characterizes the existing defect, not the desired product contract. No model,
// application bootstrap or database is imported. Replace defect expectations
// with the approved independence assertions when the correction is implemented.
async function currentMethod() {
  const source = await readFile(new URL('../../app/Models/Account.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('Account.ts', source, ts.ScriptTarget.Latest, true)
  let body
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'processOfx') body = node.body.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!body) throw new Error('Production processOfx method not found')
  return ts.transpileModule(`(async function(data, budget, user) ${body})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
}

async function ledgerOnly(ledger) {
  const calls = []
  // Inert parsed fixture isolates the balance epilogue. It does not claim the
  // current XML empty-transaction-list parser supports ledger-only uploads.
  const parsed = { OFX: { SIGNONMSGSRSV1: { SONRS: { FI: { FID: 1 } } },
    CREDITCARDMSGSRSV1: { CCSTMTTRNRS: { CCSTMTRS: {
      CCACCTFROM: { ACCTID: 'test' }, BANKTRANLIST: { STMTTRN: [] }, ...ledger,
    } } } } }
  const method = runInNewContext(await currentMethod(), {
    XMLParser: class { parse() { return parsed } },
    TrackingType: { Transactions: 'Transactions', Balances: 'Balances' },
  })
  const account = { tracking: 'Transactions', balance: 1000, plaidBalance: 1400,
    $trx: {}, async save() { calls.push('account-save') },
    async updateAccountBalanceHistory(balance) { calls.push(['history', balance]) },
    async updateStartingBalance() { calls.push(['opening', this.balance]) },
  }
  const budget = { async getUnassignedCategory() { return { id: 1 } },
    async getFundingPoolCategory() { return { async save() { calls.push('pool-save') } } },
  }
  return { account, calls, run: () => method.call(account, 'header\n\n<OFX/>', budget, {}) }
}

test.group('OFX balance authority source characterization', () => {
  test('current supplied ledger overwrites accounting balance and leaves provider balance unchanged', async ({ assert }) => {
    const fixture = await ledgerOnly({ LEDGERBAL: { BALAMT: 1500 } })
    await fixture.run()
    assert.equal(fixture.account.balance, 1500)
    assert.equal(fixture.account.plaidBalance, 1400)
    assert.deepEqual(fixture.calls[0], ['history', 1500])
    assert.deepEqual(fixture.calls[2], ['opening', 1500])
  })

  test('current zero ledger also overwrites accounting balance', async ({ assert }) => {
    const fixture = await ledgerOnly({ LEDGERBAL: { BALAMT: 0 } })
    await fixture.run()
    assert.equal(fixture.account.balance, 0)
    assert.equal(fixture.account.plaidBalance, 1400)
  })

  test('current absent ledger throws before balance persistence', async ({ assert }) => {
    const fixture = await ledgerOnly({})
    await assert.rejects(fixture.run, /BALAMT/)
    assert.deepEqual(fixture.calls, [])
    assert.equal(fixture.account.balance, 1000)
  })

  test('current explicit null BALAMT takes the incremental branch', async ({ assert }) => {
    const fixture = await ledgerOnly({ LEDGERBAL: { BALAMT: null } })
    await fixture.run()
    assert.equal(fixture.account.balance, 1000)
    assert.equal(fixture.account.plaidBalance, 1400)
  })

  test('current default XML parser can collapse leading-zero numeric identifiers', ({ assert }) => {
    const parser = new XMLParser()
    assert.deepEqual(parser.parse('<OFX><FID>001</FID><ACCTID>002</ACCTID><FITID>003</FITID></OFX>'),
      { OFX: { FID: 1, ACCTID: 2, FITID: 3 } })
  })
})
