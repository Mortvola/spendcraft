import { test } from '@japa/runner'
import { readFile, writeFile, mkdir, mkdtemp, symlink, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { orchestrate, normalizedIP, WARNING } from '../../installer/lib/applicationRollback.mjs'
import { verifyReleases, releaseManifest, releaseDifferences, validatePlan, verifyPm2Runtime,
  persistStoppedState } from '../../installer/rollbackApplication.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')

function operations(fail) {
  const calls = []
  const ops = Object.fromEntries(['preflight', 'inspect', 'confirm', 'journal', 'stop', 'backup',
    'swap', 'restart', 'smoke', 'cleanup'].map(name => [name,
    async () => { calls.push(name); if (name === fail) throw new Error('injected_failure'); return {
      applicationOnly: true } }]))
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
    assert.isBelow(calls.indexOf('smoke'), calls.indexOf('cleanup'))
    assert.notInclude(calls, 'convert'); assert.include(WARNING,
      'Database values will not be converted or restored')
  })
  test('dry-run is inspection only', async ({ assert }) => {
    const { calls, ops } = operations()
    await orchestrate({ dryRun: true }, ops)
    assert.deepEqual(calls, ['preflight', 'inspect'])
  })
  test('late failures never restart processes or convert data').with(['backup', 'swap']).run(async (
    { assert }, fail) => {
    const { calls, ops } = operations(fail)
    await assert.rejects(() => orchestrate({ dryRun: false }, ops), 'injected_failure')
    assert.notInclude(calls, 'restart'); assert.notInclude(calls, 'convert'); assert.notInclude(
      calls, 'cleanup'); assert.equal(calls.at(-1), 'stop')
  })
  test('missing previous process manifest leaves processes stopped', async ({ assert }) => {
    const { calls, ops } = operations()
    const result = await orchestrate({ manualRestart: true }, ops)
    assert.isTrue(result.manualRestartRequired)
    assert.isFalse(result.completed)
    assert.include(calls, 'swap'); assert.notInclude(calls, 'restart'); assert.notInclude(calls,
      'convert'); assert.notInclude(calls, 'cleanup')
  })
  test('new executor contains no allocation scan, data restore or mutation queries', async ({
    assert }) => {
    const source = await readFile('installer/rollbackApplication.mjs', 'utf8')
    assert.notMatch(source,
      /\b(?:UPDATE|INSERT|DELETE|TRUNCATE|ALTER)\s+(?:public\.|transactions\b)/)
    assert.notMatch(source, /\bconvert\(|\bscan\(|assertClean|categoryRollback\.mjs/)
    assert.include(source, 'default_transaction_read_only=on')
    const payload = await readFile('installer/prepareRollbackBundle.mjs', 'utf8')
    assert.notInclude(payload, 'rollbackTransactionCategoryStorage.mjs'); assert.notInclude(payload,
      'lib/categoryRollback.mjs')
  })
  test('strict loopback host CIDR and mapped-address normalization', ({ assert }) => {
    for (const value of ['127.0.0.1', '127.0.0.1/32', '::ffff:127.0.0.1/128']) assert.equal(
      normalizedIP(value), '127.0.0.1')
    for (const value of ['::1', '::1/128', '0:0:0:0:0:0:0:1']) assert.equal(normalizedIP(value),
      '::1')
    for (const value of ['::1/64', '127.0.0.1/24', '10.0.0.1', 'localhost', '::1%lo']) assert
      .throws(() => normalizedIP(value))
    assert.throws(() => validatePlan({}), 'application_only_plan_required')
  })
  test('ordinary releases pass without migration codecs; schema drift fails closed', async ({
    assert }) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'application-rollback-')))
    try {
      const envFile = join(root, 'shared-env'); await writeFile(envFile, 'synthetic')
      async function release(name, database = '{}') {
        const directory = join(root, name)
        for (const path of ['bin', 'node_modules', 'public/assets/.vite', 'config', 'app/Models',
          'app/services', 'commands']) await mkdir(join(directory, path), { recursive: true })
        for (const file of ['bin/server.js', 'ace.js', 'app/Models/Transaction.js',
          'commands/QueueListener.js', 'commands/PlaidCleanupListener.js']) await writeFile(join(
          directory, file), '{}')
        await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'spendcraft', type:
          'module', dependencies: {} }))
        await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ name: 'spendcraft',
          lockfileVersion: 3 }))
        await writeFile(join(directory, 'config/database.js'), database)
        await writeFile(join(directory, 'public/assets/App.js'), '// synthetic')
        await writeFile(join(directory, 'public/assets/.vite/manifest.json'), JSON.stringify({
          'client-src/App.tsx': { isEntry: true, file: 'App.js' } }))
        await symlink(envFile, join(directory, '.env'))
        return releaseManifest(directory)
      }
      const current = await release('spendcraft')
      let previous = await release('spendcraft.old')
      const output = join(root, 'output'); await mkdir(output)
      async function configuration() {
        await writeFile(join(root, 'current.json'), JSON.stringify(current)); await writeFile(join(
          root, 'previous.json'), JSON.stringify(previous))
        return { rollbackKind: 'application-only', root, envFile, currentManifest: join(root,
          'current.json'), previousManifest: join(root, 'previous.json'),
          reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(current, previous))),
            databaseConfigSha256: hash('{}') }
      }
      let plan = await configuration()
      assert.equal((await verifyReleases(plan, output)).previous, previous.identity)
      await rm(join(root, 'spendcraft.old'), { recursive: true }); previous = await release(
        'spendcraft.old', '// changed DB schema/config')
      plan = await configuration()
      const schemaOutput = join(root, 'schema-output'); await mkdir(schemaOutput)
      await assert.rejects(() => verifyReleases(plan, schemaOutput), 'database_release_difference')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})

test.group('Application rollback — reviewed PM2 runtime admission (no daemon)', () => {
  for (const version of ['5.4.1', '7.1.0']) {
    test(`PM2 ${version} requires the exact reviewed source, not just a version label`, async ({
      assert }) => {
      const root = await mkdtemp(join(tmpdir(), 'rollback-pm2-'))
      try {
        await mkdir(join(root, 'bin'))
        await mkdir(join(root, 'lib'))
        await writeFile(join(root, 'bin/pm2'), 'not executed')
        await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'pm2', version }))
        await writeFile(join(root, 'lib/God.js'), 'unreviewed source')
        await assert.rejects(() => verifyPm2Runtime(join(root, 'bin/pm2')),
          'unreviewed_pm2_startup_source')
      } finally { await rm(root, { recursive: true, force: true }) }
    })
  }
  for (const pkg of [{ name: 'pm2', version: '7.1.1' }, { name: 'other', version: '7.1.0' }]) {
    test(`unreviewed package ${pkg.name}@${pkg.version} is rejected`, async ({ assert }) => {
      const root = await mkdtemp(join(tmpdir(), 'rollback-pm2-'))
      try {
        await mkdir(join(root, 'bin'))
        await writeFile(join(root, 'bin/pm2'), 'not executed')
        await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
        await assert.rejects(() => verifyPm2Runtime(join(root, 'bin/pm2')),
          'unreviewed_pm2_version')
      } finally { await rm(root, { recursive: true, force: true }) }
    })
  }
  test('both primary and fallback PM2 dumps must retain stopped entries', async ({ assert }) => {
    const definition = { name: 'queue', script: '/staging/ace.js', cwd: '/staging', interpreter:
      '/node', args: [] }
    const entry = { name: 'queue', pm_exec_path: definition.script, pm_cwd: definition.cwd,
      exec_interpreter: definition.interpreter, args: [], exec_mode: 'fork_mode', status:
        'stopped' }
    const calls = []
    const operations = { save: async () => { calls.push('save') }, sync: async name => { calls.push(
      name) },
      read: async () => [entry] }
    await persistStoppedState(operations, [definition])
    assert.deepEqual(calls, ['save', 'save', 'dump.pm2', 'dump.pm2.bak'])
    await assert.rejects(() => persistStoppedState({ ...operations, read: async () => [{ ...entry,
      status: 'online' }] },
      [definition]), 'pm2_startup_not_stopped')
  })
})
