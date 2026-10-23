import { test } from '@japa/runner'
import { readFile, writeFile, mkdir, mkdtemp, symlink, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { orchestrate, normalizedIP, WARNING } from '../../installer/lib/applicationRollback.mjs'
import { verifyReleases, releaseManifest, releaseDifferences, validatePlan } from '../../installer/rollbackApplication.mjs'
import { verifyReleases as legacyVerify } from '../../installer/rollbackTransactionCategoryStorage.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')

function operations(fail) {
  const calls = []
  const ops = Object.fromEntries(['preflight', 'inspect', 'confirm', 'journal', 'stop', 'backup', 'swap', 'restart', 'smoke'].map(name => [name,
    async () => { calls.push(name); if (name === fail) throw new Error('injected_failure'); return { applicationOnly: true } }]))
  ops.convert = async () => { throw new Error('conversion_must_never_be_called') }
  return { calls, ops }
}

test.group('Application-only rollback — no database/services', () => {
  test('execute restores the application without conversion', async ({ assert }) => {
    const { calls, ops } = operations()
    await orchestrate({ dryRun: false, confirmation: 'reviewed' }, ops)
    assert.isBelow(calls.indexOf('stop'), calls.indexOf('backup'))
    assert.isBelow(calls.indexOf('backup'), calls.indexOf('swap'))
    assert.isBelow(calls.indexOf('swap'), calls.indexOf('restart'))
    assert.isBelow(calls.indexOf('restart'), calls.indexOf('smoke'))
    assert.notInclude(calls, 'convert'); assert.include(WARNING, 'Database values will not be converted or restored')
  })
  test('dry-run is inspection only', async ({ assert }) => {
    const { calls, ops } = operations()
    await orchestrate({ dryRun: true }, ops)
    assert.deepEqual(calls, ['preflight', 'inspect'])
  })
  test('late failures never restart processes or convert data').with(['backup', 'swap']).run(async ({ assert }, fail) => {
    const { calls, ops } = operations(fail)
    await assert.rejects(() => orchestrate({ dryRun: false }, ops), 'injected_failure')
    assert.notInclude(calls, 'restart'); assert.notInclude(calls, 'convert'); assert.equal(calls.at(-1), 'stop')
  })
  test('missing previous process manifest leaves processes stopped', async ({ assert }) => {
    const { calls, ops } = operations()
    assert.isTrue((await orchestrate({ manualRestart: true }, ops)).manualRestartRequired)
    assert.include(calls, 'swap'); assert.notInclude(calls, 'restart'); assert.notInclude(calls, 'convert')
  })
  test('new executor contains no allocation scan, data restore or mutation queries', async ({ assert }) => {
    const source = await readFile('installer/rollbackApplication.mjs', 'utf8')
    assert.notMatch(source, /\b(?:UPDATE|INSERT|DELETE|TRUNCATE|ALTER)\s+(?:public\.|transactions\b)/)
    assert.notMatch(source, /\bconvert\(|\bscan\(|assertClean|categoryRollback\.mjs/)
    assert.include(source, 'default_transaction_read_only=on')
    const payload = await readFile('installer/prepareRollbackBundle.mjs', 'utf8')
    assert.notInclude(payload, 'rollbackTransactionCategoryStorage.mjs'); assert.notInclude(payload, 'lib/categoryRollback.mjs')
  })
  test('strict loopback host CIDR and mapped-address normalization', ({ assert }) => {
    for (const value of ['127.0.0.1', '127.0.0.1/32', '::ffff:127.0.0.1/128']) assert.equal(normalizedIP(value), '127.0.0.1')
    for (const value of ['::1', '::1/128', '0:0:0:0:0:0:0:1']) assert.equal(normalizedIP(value), '::1')
    for (const value of ['::1/64', '127.0.0.1/24', '10.0.0.1', 'localhost', '::1%lo']) assert.throws(() => normalizedIP(value))
    assert.throws(() => validatePlan({}), 'application_only_plan_required')
  })
  test('both codec-compatible releases pass; numeric-only predecessor and schema drift fail closed', async ({ assert }) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'application-rollback-')))
    try {
      const envFile = join(root, 'shared-env'); await writeFile(envFile, 'synthetic')
      async function release(name, codec = true, database = '{}') {
        const directory = join(root, name)
        for (const path of ['bin', 'node_modules', 'public/assets/.vite', 'config', 'app/Models', 'app/services', 'commands']) await mkdir(join(directory, path), { recursive: true })
        for (const file of ['bin/server.js', 'ace.js', 'app/Models/Transaction.js', 'commands/QueueListener.js', 'commands/PlaidCleanupListener.js']) await writeFile(join(directory, file), '{}')
        await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'spendcraft', type: 'module', dependencies: {} }))
        await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ name: 'spendcraft', lockfileVersion: 3 }))
        await writeFile(join(directory, 'config/database.js'), database)
        await writeFile(join(directory, 'public/assets/App.js'), '// synthetic')
        await writeFile(join(directory, 'public/assets/.vite/manifest.json'), JSON.stringify({ 'client-src/App.tsx': { isEntry: true, file: 'App.js' } }))
        if (codec) await writeFile(join(directory, 'app/services/categoryAmountCodec.js'), '// codec')
        await symlink(envFile, join(directory, '.env'))
        return releaseManifest(directory)
      }
      const current = await release('spendcraft')
      let previous = await release('spendcraft.old')
      const output = join(root, 'output'); await mkdir(output)
      async function configuration() {
        await writeFile(join(root, 'current.json'), JSON.stringify(current)); await writeFile(join(root, 'previous.json'), JSON.stringify(previous))
        return { rollbackKind: 'application-only', root, envFile, currentManifest: join(root, 'current.json'), previousManifest: join(root, 'previous.json'),
          reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(current, previous))), databaseConfigSha256: hash('{}') }
      }
      let plan = await configuration()
      assert.equal((await verifyReleases(plan, output)).previous, previous.identity)
      await mkdir(join(root, 'legacy-output'))
      await assert.rejects(() => legacyVerify(plan, join(root, 'legacy-output')), 'not_the_first_decimal_string_release_pair')
      await rm(join(root, 'spendcraft.old'), { recursive: true }); previous = await release('spendcraft.old', false)
      plan = await configuration()
      const incompatibleOutput = join(root, 'incompatible-output'); await mkdir(incompatibleOutput)
      await assert.rejects(() => verifyReleases(plan, incompatibleOutput), 'compatible_decimal_string_release_pair_required')
      await rm(join(root, 'spendcraft.old'), { recursive: true }); previous = await release('spendcraft.old', true, '// changed DB schema/config')
      plan = await configuration()
      const schemaOutput = join(root, 'schema-output'); await mkdir(schemaOutput)
      await assert.rejects(() => verifyReleases(plan, schemaOutput), 'database_release_difference')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
