import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
import { transactionRequest } from '../../helpers/transactionRequest.js'
// PREPARED ONLY: do not run without fresh task-specific DB authorization and
// review of tests/bootstrap.ts destructive setup/cleanup safety.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import ace from '@adonisjs/core/services/ace'
import drive from '@adonisjs/drive/services/main'
import OfxUpload from '../../../commands/OfxUpload.js'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import TransactionLog from '#models/TransactionLog'
import Category from '#models/Category'
import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { AccountType, TrackingType } from '#common/ResponseTypes'
import type { ApiClient } from '@japa/api-client'

function signal() {
  let resolve: () => void = () => { throw new Error('Signal not initialized') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `writer-gate-${++sequence}`,
      email: `writer-gate-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({
      name: `Gate bank ${sequence}` })
    const account = await institution.related('accounts').create({ name: `Gate Account ${sequence}`,
      balanceCents: parseMoneyCents('100.00'),
      type: AccountType.Credit, subtype: 'credit card', tracking: TrackingType.Transactions,
        startDate: DateTime.fromISO('2025-01-01'),
      initialized: true, enabled: true, closed: false, rate: 0 })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    await account.updateStartingBalance(budget, pool)
    await pool.save()
    const unassigned = await budget.getUnassignedCategory({ client: trx })
    return { budget, user, institution, account, pool, unassigned }
  })
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Operation = 'create10' | 'create5' | 'delete' | 'patch' | 'ofx110' | 'ofx120'
function ofx(amount: number, ledger: number, id: string) {
  return 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n'
    + '<OFX><SIGNONMSGSRSV1><SONRS><FI><FID>123</FI></SONRS></SIGNONMSGSRSV1>'
    + '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>gate-account</CCACCTFROM>'
    +
      `<BANKTRANLIST><STMTTRN><DTPOSTED>20250210120000[0:GMT]<TRNAMT>${amount}<FITID>${id}<NAME>Gat\
e OFX</STMTTRN></BANKTRANLIST>`
    + `<LEDGERBAL><BALAMT>${ledger}</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`
}
async function create(client: ApiClient, f: Fixture, amount: number) {
  const response = await client.post(`/api/v1/account/${f.account.id}/transactions`).json(
    transactionRequest({
    name: `Manual ${amount}`, date: '2025-02-10', amount, categories: [],
  })).loginAs(f.user)
  response.assertStatus(200)
}
async function execute(client: ApiClient, f: Fixture, operation: Operation, target?: Transaction) {
  if (operation === 'create10' || operation === 'create5') return create(client, f, operation ===
    'create10' ? 10 : 5)
  if (operation === 'ofx110' || operation === 'ofx120') {
    const ledger = operation === 'ofx110' ? 110 : 120
    const response = await client.post(`/api/v1/account/${f.account.id}/ofx`)
      .unsafeJson(ofx(10, ledger, operation)).type('text/plain').loginAs(f.user)
    response.assertStatus(200)
    return
  }
  if (!target) throw new Error('Missing seed Transaction')
  const response = operation === 'delete'
    ? await client.delete(`/api/v1/transaction/${target.id}`).loginAs(f.user)
    : await client.patch(`/api/v1/transaction/${target.id}`).json(transactionRequest({
      version: target.version, amount: 6,
      categories: [{ categoryId: f.unassigned.id, amount: 6 }] })).loginAs(f.user)
  response.assertStatus(200)
}
async function seed(client: ApiClient, f: Fixture) {
  await create(client, f, 4)
  return Transaction.query().where('budgetId', f.budget.id).where('type', 5).firstOrFail()
}

// Observe an actual PostgreSQL wait on the gate, not a delay-based approximation.
async function waitForBudgetWaiter(ownerPid: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const result = await db.rawQuery(`SELECT query FROM pg_stat_activity
      WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`, [ownerPid])
    if (result.rows.some((row: { query: string }) => row.query.includes('applications') &&
      /for update/i.test(row.query))) return
  }
  throw new Error('Writer did not wait for the owning Budget gate')
}
async function state(f: Fixture) {
  const account = await Account.findOrFail(f.account.id)
  const unassigned = await f.budget.getUnassignedCategory()
  const pool = await f.budget.getFundingPoolCategory()
  const rows = await AccountTransaction.query().where('accountId', account.id).preload(
    'transaction').orderBy('id')
  const logs = await db.from('transaction_logs').where('application_id', f.budget.id).orderBy('id')
  return { balance: Number(formatMoneyCents(account.balanceCents)),
    plaidBalance: account.plaidBalance, unassigned: Number(formatMoneyCents(
      unassigned.balanceCents)), pool: Number(formatMoneyCents(pool.balanceCents)),
    rows: rows.map((row) => ({ amount: row.amount, pending: row.pending, type: row.transaction.type,
      deleted: row.transaction.deleted, version: row.transaction.version, categories: row
        .transaction.categories })), logs }
}

test.group('Bounded Account writer PostgreSQL serialization (prepared)', () => {
  test('participating writers wait and commit the current serial financial result').with([
    { first: 'ofx110', second: 'create5', seeded: false, balance: 115, category: 15, pool: 100,
      active: 2 },
    { first: 'create10', second: 'create5', seeded: false, balance: 115, category: 15, pool: 100,
      active: 2 },
    { first: 'create10', second: 'delete', seeded: true, balance: 110, category: 10, pool: 100,
      active: 1 },
    // OFX posts Transaction deltas; its independent provider ledger cannot change opening/Pool.
    { first: 'create10', second: 'ofx110', seeded: false, balance: 120, category: 20, pool: 100,
      active: 2 },
    { first: 'ofx110', second: 'delete', seeded: true, balance: 110, category: 10, pool: 100,
      active: 1 },
    { first: 'delete', second: 'ofx110', seeded: true, balance: 110, category: 10, pool: 100,
      active: 1 },
    { first: 'patch', second: 'ofx110', seeded: true, balance: 116, category: 16, pool: 100,
      active: 2 },
    { first: 'ofx110', second: 'patch', seeded: true, balance: 116, category: 16, pool: 100,
      active: 2 },
    { first: 'ofx110', second: 'ofx120', seeded: false, balance: 120, category: 20, pool: 100,
      active: 2 },
  ] as const).run(async ({ client, assert }, scenario) => {
    const f = await fixture()
    const target = scenario.seeded ? await seed(client, f) : undefined
    const entered = signal()
    const release = signal()
    let ownerPid = 0
    let held = false
    const save = Account.prototype.save
    const hold = mock.method(Account.prototype, 'save', async function (this: Account) {
      if (this.id === f.account.id && !held) {
        held = true
        if (!this.$trx) throw new Error('Account write escaped owning transaction')
        const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
        ownerPid = result.rows[0].pid
        entered.resolve()
        await release.promise
      }
      return save.call(this)
    })
    const first = execute(client, f, scenario.first, target).catch((error) => { entered.resolve();
      throw error })
    let second: Promise<void> | undefined
    try {
      await entered.promise
      if (!ownerPid) throw new Error('First writer did not reach a transaction-bound Account save')
      second = execute(client, f, scenario.second, target)
      await waitForBudgetWaiter(ownerPid)
    } finally {
      release.resolve()
      await Promise.allSettled([first, ...(second ? [second] : [])])
      hold.mock.restore()
    }
    await first
    await second
    const after = await state(f)
    assert.equal(after.balance, scenario.balance)
    const lastOfx = [scenario.first, scenario.second].filter((operation) => operation.startsWith(
      'ofx')).at(-1)
    assert.equal(after.plaidBalance, lastOfx === 'ofx120' ? 120 : lastOfx ? 110 : null)
    assert.equal(after.unassigned, scenario.category)
    assert.equal(after.pool, scenario.pool)
    const ordinary = after.rows.filter((row) => row.type !== 4)
    assert.lengthOf(ordinary.filter((row) => !row.deleted), scenario.active)
    assert.equal(ordinary.filter((row) => !row.deleted).reduce((sum, row) => sum + row.amount, 0),
      scenario.category)
    assert.isTrue(ordinary.every((row) => !row.pending))
    assert.equal(ordinary.filter((row) => row.version === 1).length, scenario.first === 'patch' ||
      scenario.second === 'patch' ? 1 : 0)
    const opening = after.rows.find((row) => row.type === 4)
    assert.equal(opening?.amount, scenario.pool)
    const expectedLogs = [scenario.first, scenario.second].filter((operation) => operation
      .startsWith('ofx') || operation === 'patch').length
    assert.lengthOf(after.logs, expectedLogs)
  })

  test('late CREATE failure rolls back and releases gate for a fresh waiting CREATE', async ({
    client, assert }) => {
    const f = await fixture()
    const entered = signal()
    const release = signal()
    let held = false
    let ownerPid = 0
    const save = Account.prototype.save
    const failure = mock.method(Account.prototype, 'save', async function (this: Account) {
      const saved = await save.call(this)
      if (this.id === f.account.id && !held && Number(formatMoneyCents(
        this.balanceCents)) === 110) {
        held = true
        if (!this.$trx) throw new Error('Missing owning transaction')
        const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
        ownerPid = result.rows[0].pid
        entered.resolve()
        await release.promise
        throw new Error('Synthetic late CREATE failure')
      }
      return saved
    })
    const first = client.post(`/api/v1/account/${f.account.id}/transactions`).json(
      transactionRequest({
      name: 'Rolled back CREATE', date: '2025-02-10', amount: 10, categories: [],
    })).loginAs(f.user).then((response) => { response.assertStatus(500) })
    let waiter: Promise<void> | undefined
    try {
      await entered.promise
      waiter = create(client, f, 5)
      await waitForBudgetWaiter(ownerPid)
    } finally {
      release.resolve()
      await Promise.allSettled([first, ...(waiter ? [waiter] : [])])
      failure.mock.restore()
    }
    await first
    await waiter
    const after = await state(f)
    assert.equal(after.balance, 105)
    assert.equal(after.unassigned, 5)
    assert.equal(after.pool, 100)
    const manual = after.rows.filter((row) => row.type === 5)
    assert.lengthOf(manual, 1)
    assert.equal(manual[0].amount, 5)
    assert.equal(manual[0].version, 0)
    assert.lengthOf(after.logs, 0)
  })

  test('rolled-back OFX releases gate and waiter reloads both independent balances')
    .with(['create5', 'ofx120'] as const).run(async ({ client, assert }, next) => {
      const f = await fixture()
      const entered = signal()
      const release = signal()
      let held = false
      let ownerPid = 0
      const save = Account.prototype.save
      const failure = mock.method(Account.prototype, 'save', async function (this: Account) {
        const saved = await save.call(this)
        if (this.id === f.account.id && !held && this.plaidBalance === 110) {
          held = true
          if (!this.$trx) throw new Error('Missing owning transaction')
          const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
          ownerPid = result.rows[0].pid
          entered.resolve()
          await release.promise
          throw new Error('Synthetic OFX rollback after both balances saved')
        }
        return saved
      })
      const first = client.post(`/api/v1/account/${f.account.id}/ofx`)
        .unsafeJson(ofx(10, 110, 'rollback')).type('text/plain').loginAs(f.user)
        .then((response) => { response.assertStatus(500) })
      let waiter: Promise<void> | undefined
      try {
        await entered.promise
        waiter = execute(client, f, next)
        await waitForBudgetWaiter(ownerPid)
      } finally {
        release.resolve()
        await Promise.allSettled([first, ...(waiter ? [waiter] : [])])
        failure.mock.restore()
      }
      await first; await waiter
      const after = await state(f)
      assert.equal(after.balance, next === 'create5' ? 105 : 110)
      assert.equal(after.plaidBalance, next === 'create5' ? null : 120)
      assert.equal(after.unassigned, next === 'create5' ? 5 : 10)
      assert.equal(after.pool, 100)
      assert.lengthOf(after.rows.filter((row) => row.type !== 4), 1)
      assert.lengthOf(after.logs, next === 'create5' ? 0 : 1)
    })

  test('different Budgets commit independently while another gate is held', async ({ client,
    assert }) => {
    const f = await fixture()
    const other = await fixture()
    const owner = await db.transaction()
    try {
      await Budget.query({ client: owner }).where('id', f.budget.id).forUpdate().firstOrFail()
      await create(client, other, 5)
      assert.equal((await Account.findOrFail(other.account.id)).balanceCents, parseMoneyCents(
        '105.00'))
      assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents('100.00'))
      assert.equal((await other.budget.getUnassignedCategory()).balanceCents, parseMoneyCents(
        '5.00'))
      assert.equal((await f.budget.getUnassignedCategory()).balanceCents, parseMoneyCents('0.00'))
      assert.equal((await other.budget.getFundingPoolCategory()).balanceCents, parseMoneyCents(
        '100.00'))
      assert.lengthOf(await AccountTransaction.query().where('accountId', other.account.id), 2)
    } finally { await owner.rollback() }
  })
  test(
    'OFX command waits for HTTP OFX and reloads the scoped selection despite foreign same-name \
Account', async ({ client, assert }) => {
    const foreign = await fixture()
    const f = await fixture()
    foreign.account.name = f.account.name
    await foreign.account.save()
    const command = await ace.create(OfxUpload, ['prepared.ofx'])
    const ask = mock.method(command.prompt, 'ask', async () => f.user.username)
    const choice = mock.method(command.prompt, 'choice', async (title: string) => title ===
      'Select the institution' ? f.institution.name : f.account.name)
    const file = mock.method(drive.use('fs'), 'get', async () => Buffer.from(ofx(10, 120,
      'command120')))
    const entered = signal()
    const release = signal()
    let ownerPid = 0
    let held = false
    const save = Account.prototype.save
    const hold = mock.method(Account.prototype, 'save', async function (this: Account) {
      if (this.id === f.account.id && !held) {
        held = true
        if (!this.$trx) throw new Error('Missing owning transaction')
        const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
        ownerPid = result.rows[0].pid
        entered.resolve()
        await release.promise
      }
      return save.call(this)
    })
    const http = execute(client, f, 'ofx110')
    let importing: Promise<void> | undefined
    try {
      await entered.promise
      importing = command.run()
      await waitForBudgetWaiter(ownerPid)
    } finally {
      release.resolve()
      await Promise.allSettled([http, ...(importing ? [importing] : [])])
      hold.mock.restore(); ask.mock.restore(); choice.mock.restore(); file.mock.restore()
    }
    await http
    await importing
    const after = await state(f)
    assert.equal(after.balance, 120)
    assert.equal(after.unassigned, 20)
    assert.equal(after.pool, 100)
    assert.lengthOf(after.rows.filter((row) => row.type !== 4 && !row.deleted), 2)
    assert.lengthOf(after.logs, 2)
    assert.equal((await Account.findOrFail(foreign.account.id)).balanceCents, parseMoneyCents(
      '100.00'))
    assert.lengthOf(await AccountTransaction.query().where('accountId', foreign.account.id), 1)
  })

  test('same-Budget different-Account CREATE and startDate overlap serialize').with([
    'different Account', 'startDate']).run(async ({ client, assert }, kind) => {
    const f = await fixture()
    const other = kind === 'different Account' ? await db.transaction(async (trx) => {
      const account = await Account.create({ institutionId: f.institution.id, name:
        'Other gate Account', balanceCents: parseMoneyCents('100.00'),
        type: AccountType.Credit, subtype: 'credit card', tracking: TrackingType.Transactions,
        startDate: DateTime.fromISO('2025-01-01'), initialized: true, enabled: true, closed: false,
          rate: 0 }, { client: trx })
      const pool = await f.budget.getFundingPoolCategory({ client: trx })
      await account.updateStartingBalance(f.budget, pool)
      await pool.save()
      return account
    }) : undefined
    const entered = signal()
    const release = signal()
    let pid = 0
    let held = false
    const save = Account.prototype.save
    const hold = mock.method(Account.prototype, 'save', async function (this: Account) {
      if (this.id === f.account.id && !held) {
        held = true
        if (!this.$trx) throw new Error('Missing owning transaction')
        const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
        pid = result.rows[0].pid
        entered.resolve()
        await release.promise
      }
      return save.call(this)
    })
    const first = create(client, f, 10)
    let second: Promise<void> | undefined
    try {
      await entered.promise
      second = other ? create(client, { ...f, account: other }, 5)
        : client.patch(`/api/v1/account/${f.account.id}`).json({ startDate: '2025-03-01' }).loginAs(
          f.user)
          .then((result) => { result.assertStatus(200) })
      await waitForBudgetWaiter(pid)
    } finally {
      release.resolve()
      await Promise.allSettled([first, ...(second ? [second] : [])])
      hold.mock.restore()
    }
    await first
    await second
    const after = await state(f)
    assert.equal(after.balance, 110)
    assert.equal(after.unassigned, other ? 15 : 0)
    assert.equal(after.pool, other ? 200 : 110)
    assert.lengthOf(after.rows.filter((row) => row.type === 5), 1)
    if (other) {
      assert.equal((await Account.findOrFail(other.id)).balanceCents, parseMoneyCents('105.00'))
      assert.lengthOf(await AccountTransaction.query().where('accountId', other.id), 2)
    } else {
      assert.equal((await Account.findOrFail(f.account.id)).startDate.toISODate(), '2025-03-01')
      const opening = await AccountTransaction.query().where('accountId', f.account.id)
        .whereHas('transaction', (query) => query.where('type', 4)).preload('transaction')
          .firstOrFail()
      assert.equal(opening.transaction.date.toISODate(), '2025-03-01')
      assert.equal(opening.amount, 110)
    }
  })

  test('protected financial model writes use one owning transaction')
    .with(['create', 'delete', 'patch', 'ofx', 'startDate']).run(async ({ client, assert }, kind) =>
      {
      const f = await fixture()
      const target = kind === 'delete' || kind === 'patch' ? await seed(client, f) : undefined
      const clients = new Set<TransactionClientContract>()
      const models = new Set<string>()
      const prototypes: LucidRow[] = [Account.prototype, AccountTransaction.prototype, Transaction
        .prototype,
        Category.prototype, TransactionLog.prototype]
      const audits = prototypes.map((prototype) => {
        const save = prototype.save
        return mock.method(prototype, 'save', async function (this: LucidRow) {
          if (!this.$trx) throw new Error(`Protected ${this.constructor
            .name} write escaped transaction`)
          clients.add(this.$trx)
          models.add(this.constructor.name)
          return save.call(this)
        })
      })
      try {
        if (kind === 'startDate') {
          const response = await client.patch(`/api/v1/account/${f.account.id}`).json({ startDate:
            '2025-02-01' }).loginAs(f.user)
          response.assertStatus(200)
        } else await execute(client, f, kind === 'create' ? 'create5' : kind === 'ofx' ?
          'ofx110' : kind === 'delete' ? 'delete' : 'patch', target)
      } finally { audits.forEach((audit) => audit.mock.restore()) }
      assert.equal(clients.size, 1)
      assert.isTrue(models.has('Account'))
      if (kind === 'ofx') {
        assert.isTrue(models.has('Category'))
        assert.isTrue(models.has('TransactionLog'))
        assert.isTrue(models.has('AccountTransaction'))
      }
    })

})

test.group('Eligibility boundary waiting-writer reload (prepared)', () => {
  test('CREATE/PATCH/OFX reload startDate after waiting for its committed change')
    .with(['create', 'patch', 'ofx']).run(async ({ client, assert }, kind) => {
      const f = await fixture()
      const target = kind === 'patch' ? await seed(client, f) : undefined
      const entered = signal()
      const release = signal()
      let pid = 0
      let held = false
      const save = Account.prototype.save
      const hold = mock.method(Account.prototype, 'save', async function (this: Account) {
        if (this.id === f.account.id && !held) {
          held = true
          if (!this.$trx) throw new Error('Missing owning transaction')
          const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
          pid = result.rows[0].pid
          entered.resolve()
          await release.promise
        }
        return save.call(this)
      })
      const first = client.patch(`/api/v1/account/${f.account.id}`).json({ startDate:
        '2025-03-01' }).loginAs(f.user)
        .then((response) => { response.assertStatus(200) })
      let second: Promise<void> | undefined
      try {
        await entered.promise
        second = kind === 'create' ? create(client, f, 10)
          : execute(client, f, kind === 'patch' ? 'patch' : 'ofx110', target)
        await waitForBudgetWaiter(pid)
      } finally {
        release.resolve()
        await Promise.allSettled([first, ...(second ? [second] : [])])
        hold.mock.restore()
      }
      await first
      await second
      const after = await state(f)
      assert.equal(after.balance, kind === 'patch' ? 104 : 100)
      assert.equal(after.unassigned, 0)
      assert.equal(after.pool, kind === 'patch' ? 104 : 100)
      assert.equal((await Account.findOrFail(f.account.id)).startDate.toISODate(), '2025-03-01')
      const ordinaryRows = after.rows.filter((row) => row.type !== 4 && !row.deleted)
      assert.lengthOf(ordinaryRows, 1)
      assert.equal(ordinaryRows[0].amount, kind === 'patch' ? 6 : 10)
      if (kind === 'patch') {
        assert.equal(ordinaryRows[0].version, 1)
        assert.isTrue(after.logs.some((log) => log.transaction_id === target?.id))
      }
      if (kind === 'ofx') assert.equal(after.plaidBalance, 110)
    })
})

test.group('startDate rollback eligibility reload', () => {
  test('waiting CREATE uses the old boundary after a late startDate rollback', async ({ client,
    assert }) => {
    const f = await fixture()
    const entered = signal()
    const release = signal()
    let pid = 0
    let held = false
    const save = Account.prototype.save
    const failure = mock.method(Account.prototype, 'save', async function (this: Account) {
      const saved = await save.call(this)
      if (this.id === f.account.id && !held && this.startDate.toISODate() === '2025-03-01') {
        held = true
        if (!this.$trx) throw new Error('Missing owning transaction')
        const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
        pid = result.rows[0].pid
        entered.resolve()
        await release.promise
        throw new Error('Injected late startDate rollback')
      }
      return saved
    })
    const first = client.patch(`/api/v1/account/${f.account.id}`).json({ startDate: '2025-03-01' })
      .loginAs(f.user)
      .then((response) => { response.assertStatus(500) })
    let waiter: Promise<void> | undefined
    try {
      await entered.promise
      waiter = create(client, f, 5)
      await waitForBudgetWaiter(pid)
    } finally {
      release.resolve()
      await Promise.allSettled([first, ...(waiter ? [waiter] : [])])
      failure.mock.restore()
    }
    await first
    await waiter
    const after = await state(f)
    assert.equal(after.balance, 105)
    assert.equal(after.unassigned, 5)
    assert.equal(after.pool, 100)
    assert.equal((await Account.findOrFail(f.account.id)).startDate.toISODate(), '2025-01-01')
    const opening = await AccountTransaction.query().where('accountId', f.account.id)
      .whereHas('transaction', (query) => query.where('type', 4)).preload('transaction')
        .firstOrFail()
    assert.equal(opening.transaction.date.toISODate(), '2025-01-01')
    assert.equal(opening.amount, 100)
    assert.lengthOf(after.rows.filter((row) => row.type === 5), 1)
    assert.lengthOf(after.logs, 0)
  })
})
