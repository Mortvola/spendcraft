import { validateCategoryConservation } from '../../app/services/categoryAmountCodec.ts'
import { decodeTaxAttributions, encodeTaxAttributions } from '../../app/services/taxAmountCodec.ts'
import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { taxStorageCompatibility, statementIncomeStorageCompatibility, requireTaxStorageCompatibility } from '../../installer/lib/taxReleaseRecovery.mjs'
import { releaseManifest, verifyReleases, validatePlan, releaseDifferences } from '../../installer/rollbackApplication.mjs'
import { writeTaxRuntimeFixture } from '../helpers/taxRecoveryRelease.js'
import { orchestrate } from '../../installer/lib/applicationRollback.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')

async function fixture(root, name = 'spendcraft.new') {
  const directory = join(root, name)
  for (const path of ['bin', 'node_modules', 'public/assets/.vite', 'config', 'app/Models', 'commands']) await mkdir(join(directory, path), { recursive: true })
  for (const path of ['bin/server.js', 'ace.js', 'commands/QueueListener.js', 'commands/PlaidCleanupListener.js']) await writeFile(join(directory, path), '// synthetic')
  await writeTaxRuntimeFixture(directory)
  await writeFile(join(directory, 'config/database.js'), '// synthetic db config')
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'spendcraft', type: 'module', dependencies: {} }))
  await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ name: 'spendcraft', lockfileVersion: 3 }))
  await writeFile(join(directory, 'public/assets/.vite/manifest.json'), JSON.stringify({ 'client-src/App.tsx': { isEntry: true, file: 'App.js' } }))
  await writeFile(join(directory, 'public/assets/App.js'), '// synthetic client')
  await writeFile(join(root, 'spendcraft-env'), 'APP_URL=https://staging.spendcraft.app\n# synthetic-secret-not-copied')
  await symlink('../spendcraft-env', join(directory, '.env'))
  return directory
}

test.group('Tax compatible release recovery (temporary files only)', group => {
  let root
  group.each.setup(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'tax-release-recovery-')))
    return () => rm(root, { recursive: true, force: true })
  })
  test('recognizes real emitted model, PATCH, report and both codec boundaries', async ({ assert }) => {
    const release = await fixture(root), manifest = await releaseManifest(release)
    assert.equal(taxStorageCompatibility(manifest), 'reviewed-tax-and-category-boundary')
    assert.equal(statementIncomeStorageCompatibility(manifest), 'reviewed-statement-income-boundary')
    assert.doesNotThrow(() => requireTaxStorageCompatibility(manifest))
  })
  test('Statement model, codec, binding and API writer must all be reviewed compiled files').with([
    'app/Models/Statement.js', 'app/services/statementIncomeCodec.js',
    'app/services/statementIncomeStorage.js', 'app/Controllers/Http/AccountsController.js',
  ]).run(async ({ assert }, name) => {
    const release = await fixture(root)
    await writeFile(join(release, name), '// unreviewed or numeric-only implementation')
    const manifest = await releaseManifest(release)
    assert.equal(taxStorageCompatibility(manifest), 'reviewed-tax-and-category-boundary')
    assert.equal(statementIncomeStorageCompatibility(manifest), 'unknown')
    assert.throws(() => requireTaxStorageCompatibility(manifest), 'statement_income_storage_compatibility_unknown')
  })
  test('missing decoding and metadata-only compatibility declarations fail closed', async ({ assert }) => {
    const release = await fixture(root)
    await rm(join(release, 'app/services/statementIncomeStorage.js'))
    await writeFile(join(release, 'release-source.json'), JSON.stringify({ commit: 'e07648afcaa4d721c96648570f171d359e759996', capabilities: ['statement-income-strings'] }))
    await writeFile(join(release, 'statement-income-compatible'), 'true')
    const manifest = await releaseManifest(release)
    assert.equal(statementIncomeStorageCompatibility(manifest), 'unknown')
    assert.throws(() => requireTaxStorageCompatibility(manifest), 'statement_income_storage_compatibility_unknown')
    for (const unknown of [null, {}, { format: 1, identity: 'x', files: [] }, { capabilities: ['statement-income-strings'] }]) {
      assert.equal(statementIncomeStorageCompatibility(unknown), 'unknown')
    }
  })
  test('genuinely compatible prior release passes admission independently of commit labels', async ({ assert }) => {
    const currentDirectory = await fixture(root, 'spendcraft'), previousDirectory = await fixture(root, 'spendcraft.old')
    await writeFile(join(previousDirectory, 'release-source.json'), JSON.stringify({ commit: 'a'.repeat(40) }))
    const current = await releaseManifest(currentDirectory), previous = await releaseManifest(previousDirectory)
    const output = join(root, 'inspection'); await mkdir(output)
    await writeFile(join(output, 'current.json'), JSON.stringify(current)); await writeFile(join(output, 'previous.json'), JSON.stringify(previous))
    const plan = { root, currentManifest: join(output, 'current.json'), previousManifest: join(output, 'previous.json'),
      envFile: join(root, 'spendcraft-env'), reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(current, previous))),
      databaseConfigSha256: hash('// synthetic db config') }
    assert.equal((await verifyReleases(plan, output)).previous, previous.identity)
  })
  test('Statement rejection prevents database inspection, PM2 shutdown and directory/journal changes', async ({ assert }) => {
    const currentDirectory = await fixture(root, 'spendcraft'), previousDirectory = await fixture(root, 'spendcraft.old')
    await rm(join(previousDirectory, 'app/services/statementIncomeStorage.js'))
    const current = await releaseManifest(currentDirectory), previous = await releaseManifest(previousDirectory)
    const output = join(root, 'inspection'); await mkdir(output)
    await writeFile(join(output, 'current.json'), JSON.stringify(current)); await writeFile(join(output, 'previous.json'), JSON.stringify(previous))
    const plan = { root, currentManifest: join(output, 'current.json'), previousManifest: join(output, 'previous.json'),
      envFile: join(root, 'spendcraft-env'), reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(current, previous))),
      databaseConfigSha256: hash('// synthetic db config') }
    const events = [], before = await readdir(root)
    const ops = Object.fromEntries(['inspect', 'confirm', 'journal', 'stop', 'backup', 'swap', 'restart', 'smoke', 'cleanup'].map(name => [name, async () => { events.push(name) }]))
    ops.preflight = () => verifyReleases(plan, output)
    await assert.rejects(() => orchestrate({ dryRun: false }, ops), 'statement_income_storage_compatibility_unknown')
    assert.deepEqual(events, []); assert.deepEqual(await readdir(root), before)
    assert.equal((await releaseManifest(currentDirectory)).identity, current.identity)
    assert.equal((await releaseManifest(previousDirectory)).identity, previous.identity)
  })
  test('mere codec presence, missing/changed components and unknown manifests fail closed').with([
    'app/Models/Transaction.js', 'app/services/taxAmountCodec.js', 'app/services/taxStorageBinding.js',
    'app/services/transactionTaxStorage.js', 'app/Controllers/Http/TransactionsController.js',
    'app/Controllers/Http/TaxesController.js', 'app/services/categoryAmountCodec.js',
  ]).run(async ({ assert }, name) => {
    const release = await fixture(root)
    await writeFile(join(release, name), '// unrelated or older implementation')
    const manifest = await releaseManifest(release)
    assert.equal(taxStorageCompatibility(manifest), 'unknown')
    assert.throws(() => requireTaxStorageCompatibility(manifest), 'tax_storage_compatibility_unknown')
  })
  test('invalid and self-declared capability manifests are not trusted', ({ assert }) => {
    for (const value of [null, {}, { format: 1, identity: 'x', files: [] }, { capabilities: ['tax-string'] }]) assert.equal(taxStorageCompatibility(value), 'unknown')
  })
  test('no database reversal or restart after interrupted recovery').with(['before-writes', 'after-writes'])
    .run(async ({ assert }, scenario) => {
      const financialState = { transactions: [1, 2], taxes: scenario === 'after-writes' ? ['12.35'] : [12.34], balance: 123 }
      const before = JSON.stringify(financialState), events = []
      const ops = Object.fromEntries(['preflight', 'inspect', 'confirm', 'journal', 'stop', 'backup', 'swap', 'restart', 'smoke', 'cleanup'].map(name => [name, async () => {
        events.push(name)
        if (name === 'swap') throw new Error('interrupted')
      }]))
      await assert.rejects(() => orchestrate({ dryRun: false }, ops), 'interrupted')
      assert.notInclude(events, 'restart')
      assert.equal(JSON.stringify(financialState), before)
    })
  test('application guard rejects an actual predecessor without tax decoding', async ({ assert }) => {
    const currentDirectory = await fixture(root, 'spendcraft')
    const previousDirectory = await fixture(root, 'spendcraft.old')
    await writeFile(join(previousDirectory, 'app/Models/Transaction.js'), '// previous numeric-tax-only model')
    const current = await releaseManifest(currentDirectory), previous = await releaseManifest(previousDirectory)
    const output = join(root, 'inspection')
    await mkdir(output)
    await writeFile(join(output, 'current.json'), JSON.stringify(current))
    await writeFile(join(output, 'previous.json'), JSON.stringify(previous))
    const plan = { root, currentManifest: join(output, 'current.json'), previousManifest: join(output, 'previous.json'),
      envFile: join(root, 'spendcraft-env'), reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(current, previous))),
      databaseConfigSha256: hash('// synthetic db config') }
    await assert.rejects(() => verifyReleases(plan, output), 'tax_storage_compatibility_unknown')
  })
  test('obsolete preserved-copy plans fail closed instead of selecting another target', ({ assert }) => {
    assert.throws(() => validatePlan({ rollbackKind: 'application-only', recoveryIdentity: 'a'.repeat(64) }), 'alternate_recovery_target_not_supported')
  })
  test('synthetic staging specification conserves and supports numeric/string/mixed tax fixtures', async ({ assert }) => {
    const specification = JSON.parse(await readFile('tests/fixtures/taxRecoveryRehearsal.json', 'utf8'))
    for (const row of specification.transactions) {
      validateCategoryConservation(row.type, row.categories, row.accountAmount, specification.poolId)
      const before = JSON.stringify(row)
      const decoded = decodeTaxAttributions(row.taxes)
      assert.isTrue(decoded.every(entry => typeof entry.amount === 'number'))
      assert.equal(JSON.stringify(row), before)
    }
    const encoded = encodeTaxAttributions(specification.taxPatchInputs.map(amount => ({ type: 'INTEREST', amount })))
    assert.deepEqual(encoded.map(entry => entry.amount), ['12.35', '-1.00', '0.30', '0.00'])
  })
  test('installer creates no recovery copy; immutable bundle retains compatibility guard and profile', async ({ assert }) => {
    const source = await readFile('installer/install.sh0', 'utf8')
    assert.notInclude(source, 'preserveTaxRelease')
    assert.notInclude(source, 'maintenance/tax-recovery')
    const bundle = await readFile('installer/prepareRollbackBundle.mjs', 'utf8')
    assert.include(bundle, "'lib/taxReleaseRecovery.mjs'")
    assert.include(bundle, "'tax-storage-profile.json'")
    const executor = await readFile('installer/rollbackApplication.mjs', 'utf8')
    assert.include(executor, 'requireTaxStorageCompatibility(previous)')
    assert.notInclude(executor, 'UPDATE transactions')
    const entrypoint = executor.slice(executor.indexOf('export async function main('))
    const gate = entrypoint.indexOf('requireTaxStorageCompatibility(await previousReleaseManifest(plan.root))')
    assert.isAbove(gate, 0)
    assert.isBelow(gate, entrypoint.indexOf('await verifyFilesystemAdmission('))
    assert.isBelow(gate, entrypoint.indexOf('await connectionConfig('))
    assert.isBelow(gate, entrypoint.indexOf("await import('pg')"))
  })
})
