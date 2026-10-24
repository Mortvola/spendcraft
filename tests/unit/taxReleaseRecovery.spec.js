import { validateCategoryConservation } from '../../app/services/categoryAmountCodec.ts'
import { decodeTaxAttributions, encodeTaxAttributions } from '../../app/services/taxAmountCodec.ts'
import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { taxStorageCompatibility, requireTaxStorageCompatibility } from '../../installer/lib/taxReleaseRecovery.mjs'
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
    assert.doesNotThrow(() => requireTaxStorageCompatibility(manifest))
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
      const ops = Object.fromEntries(['preflight', 'inspect', 'confirm', 'journal', 'stop', 'backup', 'swap', 'restart', 'smoke'].map(name => [name, async () => {
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
  })
})
