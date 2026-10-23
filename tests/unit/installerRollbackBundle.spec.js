import { test } from '@japa/runner'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink, realpath, readdir, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { selectRollback, launchRollback } from '../../installer/launchRollback.mjs'
import { assertExecutorBundle, releaseManifest } from '../../installer/rollbackApplication.mjs'
import { prepareRollbackBundle, verifyRollbackBundle } from '../../installer/prepareRollbackBundle.mjs'

const releaseId = 'a'.repeat(64)
const source = { format: 1, commit: 'b'.repeat(40), dirty: false, builtAt: '2026-10-22T00:00:00Z' }

test.group('Stable rollback bundle (local packages, no database/services/network)', (group) => {
  let root
  group.each.setup(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'spendcraft-rollback-bundle-')))
    return () => rm(root, { recursive: true, force: true })
  })
  async function fixture() {
    const release = join(root, 'spendcraft.new')
    await mkdir(join(release, 'installer/lib'), { recursive: true })
    for (const file of ['pm2-processes.json', 'lib/pm2Processes.mjs', 'prepareRollbackBundle.mjs', 'rollbackApplication.mjs', 'lib/applicationRollback.mjs', 'lib/releaseManifest.mjs', 'lib/rollbackBundleIntegrity.mjs', 'launchRollback.mjs', 'rollback.sh']) {
      await writeFile(join(release, 'installer', file), await readFile(join('installer', file)))
    }
    await writeFile(join(release, 'package.json'), JSON.stringify({ name: 'spendcraft', type: 'module', dependencies: { pg: '1.0.0' } }))
    await writeFile(join(release, 'package-lock.json'), JSON.stringify({ name: 'spendcraft', lockfileVersion: 3 }))
    await writeFile(join(release, 'release-source.json'), JSON.stringify(source))
    for (const file of ['bin/server.js', 'ace.js', 'config/database.js', 'app/Models/Transaction.js', 'commands/QueueListener.js', 'commands/PlaidCleanupListener.js', 'public/assets/App.js']) {
      await mkdir(join(release, file, '..'), { recursive: true })
      await writeFile(join(release, file), '// fixture')
    }
    await mkdir(join(release, 'public/assets/.vite'))
    await writeFile(join(release, 'public/assets/.vite/manifest.json'), JSON.stringify({ 'client-src/App.tsx': { isEntry: true, file: 'App.js' } }))
    await writeFile(join(root, 'shared-env'), 'synthetic-settings')
    await symlink('../shared-env', join(release, '.env'))
    // Synthetic package graph exercises transitive dependency copying. Its Client
    // cannot be used to connect; import only is exercised by the packager.
    for (const [name, pkg, code] of [
      ['pg', { dependencies: { 'fixture-runtime': '1.0.0' }, peerDependencies: { 'absent-native': '*' }, peerDependenciesMeta: { 'absent-native': { optional: true } } }, "const dependency=require('fixture-runtime'); exports.Client=class Client { constructor(){throw new Error('No connections in fixture')} }; exports.version=dependency;"],
      ['fixture-runtime', {}, "module.exports='fixture-runtime-present'"],
    ]) {
      const path = join(release, 'node_modules', name)
      await mkdir(path, { recursive: true })
      await writeFile(join(path, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...pkg }))
      await writeFile(join(path, 'index.js'), code)
    }
    return release
  }
  async function installed() {
    const release = await fixture()
    const current = await releaseManifest(release)
    const bundle = await prepareRollbackBundle({ root, release, releaseId: current.identity, source })
    await rename(release, join(root, 'spendcraft'))
    const currentManifest = join(root, 'current.json')
    await writeFile(currentManifest, JSON.stringify(current))
    const plan = { rollbackKind: 'application-only', root, currentManifest }
    await writeFile(join(root, 'maintenance/rollback-plan.json'), JSON.stringify(plan))
    return { ...bundle, current, plan }
  }
  test('selects the exact installed bundle and hands off only the selected mode and fixed plan')
    .with(['--dry-run', '--execute']).run(async ({ assert }, mode) => {
      const setup = await installed()
      let called = 0
      const exitCode = await launchRollback(root, mode, async (selection, selectedMode) => {
        called++
        assert.equal(selection.bundle, setup.directory)
        assert.equal(selection.planPath, join(root, 'maintenance/rollback-plan.json'))
        assert.equal(selection.executor, join(setup.directory, 'rollbackApplication.mjs'))
        assert.equal(selectedMode, mode)
        return 7
      })
      assert.equal(called, 1)
      assert.equal(exitCode, 7)
      await assertExecutorBundle(setup.plan, setup.directory)
    })
  test('refuses legacy conversion plans and bundles instead of dispatching to the conversion tool', async ({ assert }) => {
    const setup = await installed()
    await writeFile(join(root, 'maintenance/rollback-plan.json'), JSON.stringify({ ...setup.plan, rollbackKind: 'legacy-conversion' }))
    let called = false
    await assert.rejects(() => launchRollback(root, '--execute', async () => { called = true }), 'application_only_rollback_required')
    assert.isFalse(called)
    const path = join(setup.directory, 'bundle.json')
    const manifest = JSON.parse(await readFile(path, 'utf8'))
    manifest.purpose = 'transaction-category-decimal-string-rollback'
    await writeFile(path, JSON.stringify(manifest))
    await writeFile(join(root, 'maintenance/rollback-plan.json'), JSON.stringify(setup.plan))
    await assert.rejects(() => launchRollback(root, '--execute', async () => { called = true }), 'application_only_rollback_required')
    assert.isFalse(called)
    assert.notInclude(await readdir(setup.directory), 'rollbackTransactionCategoryStorage.mjs')
  })
  test('never falls back to another bundle after the installed release changes', async ({ assert }) => {
    await installed()
    await writeFile(join(root, 'spendcraft/ace.js'), '// changed installed release')
    await assert.rejects(() => selectRollback(root))
  })
  test('rejects damaged bundles and mismatched bundle identities before invoking any child').with(['damage', 'wrong-id'])
    .run(async ({ assert }, kind) => {
      const setup = await installed()
      if (kind === 'damage') await writeFile(join(setup.directory, 'lib/applicationRollback.mjs'), '// changed')
      else {
        const path = join(setup.directory, 'bundle.json')
        const manifest = JSON.parse(await readFile(path, 'utf8'))
        manifest.releaseId = 'f'.repeat(64)
        await writeFile(path, JSON.stringify(manifest))
      }
      let called = false
      await assert.rejects(() => launchRollback(root, '--execute', async () => { called = true }))
      assert.isFalse(called)
      await assert.rejects(() => assertExecutorBundle(setup.plan, setup.directory))
    })
  test('rejects a missing, stale or foreign plan before invoking a child').with(['missing', 'stale', 'foreign'])
    .run(async ({ assert }, kind) => {
      const setup = await installed()
      const path = join(root, 'maintenance/rollback-plan.json')
      if (kind === 'missing') await rm(path)
      if (kind === 'foreign') await writeFile(path, JSON.stringify({ ...setup.plan, root: join(root, 'foreign') }))
      if (kind === 'stale') {
        const files = []
        await writeFile(setup.plan.currentManifest, JSON.stringify({ format: 1, files, identity: createHash('sha256').update('[]').digest('hex') }))
      }
      let called = false
      await assert.rejects(() => launchRollback(root, '--dry-run', async () => { called = true }))
      assert.isFalse(called)
    })
  test('installed shell forwards the mode and inferred root without requiring plan arguments').with(['--dry-run', '--execute'])
    .run(async ({ assert }, mode) => {
      await installed()
      const bin = join(root, 'fake-bin')
      await mkdir(bin)
      await writeFile(join(bin, 'node'), '#!/bin/bash\nprintf "ARG:%s\\n" "$@"\nprintf "CWD:%s\\n" "$PWD"\nexit 7\n')
      await chmod(join(bin, 'node'), 0o700)
      const result = spawnSync(join(root, 'maintenance/rollback.sh'), [mode], {
        cwd: root, encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, SPENDCRAFT_ROOT: root },
      })
      assert.equal(result.status, 7, result.stderr)
      assert.include(result.stdout, `ARG:--root\nARG:${root}\nARG:${mode}\n`)
      assert.include(result.stdout, `CWD:${root}/maintenance`)
      assert.notInclude(result.stdout, '--plan')
    })
  test('installed shell rejects invalid arguments and wrong SPENDCRAFT_ROOT before Node starts', async ({ assert }) => {
    await installed()
    const shell = join(root, 'maintenance/rollback.sh')
    for (const args of [[], ['--force'], ['--dry-run', '--execute']]) {
      const result = spawnSync(shell, args, { encoding: 'utf8', env: { PATH: process.env.PATH } })
      assert.equal(result.status, 1)
      assert.include(result.stderr, 'Usage:')
    }
    const wrongRoot = spawnSync(shell, ['--dry-run'], { encoding: 'utf8', env: { PATH: process.env.PATH, SPENDCRAFT_ROOT: join(root, 'spendcraft') } })
    assert.equal(wrongRoot.status, 1)
    assert.include(wrongRoot.stderr, 'does not match')
  })
  test('real shell/Node launcher stops a deliberately incomplete plan before any database access', async ({ assert }) => {
    await installed()
    const result = spawnSync(join(root, 'maintenance/rollback.sh'), ['--dry-run'], { encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH, SPENDCRAFT_ROOT: root } })
    assert.equal(result.status, 1)
    assert.include(result.stdout, 'Selected rollback bundle:')
    assert.include(result.stderr, 'invalid_plan_paths')
  })
  test('publishes a self-contained bundle that survives release removal and repeated preparation', async ({ assert }) => {
    const release = await fixture()
    const result = await prepareRollbackBundle({ root, release, releaseId, source })
    assert.equal(result.directory, join(root, 'maintenance/rollback', releaseId))
    assert.equal((await verifyRollbackBundle(result.directory)).releaseId, releaseId)
    const original = await readFile(join(result.directory, 'bundle.json'), 'utf8')
    assert.equal((await prepareRollbackBundle({ root, release, releaseId, source })).directory, result.directory)
    assert.equal(await readFile(join(result.directory, 'bundle.json'), 'utf8'), original)
    await rename(release, join(root, 'spendcraft'))
    await rm(join(root, 'spendcraft'), { recursive: true })
    const help = spawnSync(process.execPath, ['rollbackApplication.mjs', '--help'], { cwd: result.directory, encoding: 'utf8' })
    assert.equal(help.status, 0, help.stderr)
    const require = createRequire(join(result.directory, 'package.json'))
    assert.isTrue(require.resolve('pg').startsWith(result.directory + '/'))
    assert.equal(require('pg').version, 'fixture-runtime-present')
    assert.isFalse((await readdir(result.directory)).some((name) => name.endsWith('.env')))
  })
  test('filesystem-only rollback results stay outside the immutable bundle', async ({ assert }) => {
    const release = await fixture()
    const result = await prepareRollbackBundle({ root, release, releaseId, source })
    const empty = { format: 1, files: [], identity: createHash('sha256').update('[]').digest('hex') }
    await writeFile(join(root, 'current.json'), JSON.stringify(empty))
    await writeFile(join(root, 'previous.json'), JSON.stringify(empty))
    const compared = spawnSync(process.execPath, ['rollbackApplication.mjs', '--compare-manifests',
      '--current-manifest', join(root, 'current.json'), '--previous-manifest', join(root, 'previous.json')],
    { cwd: result.directory, encoding: 'utf8' })
    assert.equal(compared.status, 0, compared.stderr)
    assert.isTrue(compared.stdout.trim().startsWith(join(root, 'maintenance/rollback/application-rollback-')))
    await verifyRollbackBundle(result.directory)
  })
  test('copies the actual installed pg dependency closure and imports it outside the release', async ({ assert }) => {
    const result = await prepareRollbackBundle({ root, release: resolve('.'), releaseId, source })
    const require = createRequire(join(result.directory, 'package.json'))
    assert.isTrue(require.resolve('pg').startsWith(result.directory + '/'))
    assert.equal(typeof require('pg').Client, 'function')
    assert.equal((await verifyRollbackBundle(result.directory)).pgVersion, require('pg/package.json').version)
  }).timeout(30000)
  test('fails before publication if a tool or required dependency is missing').with(['tool', 'dependency'])
    .run(async ({ assert }, missing) => {
      const release = await fixture()
      await rm(join(release, missing === 'tool' ? 'installer/lib/applicationRollback.mjs' : 'node_modules/fixture-runtime'), { recursive: true })
      await assert.rejects(() => prepareRollbackBundle({ root, release, releaseId, source }))
      await assert.rejects(() => readFile(join(root, 'maintenance/rollback', releaseId, 'bundle.json')))
      assert.isTrue((await readdir(join(root, 'maintenance/rollback'))).some((name) => name.startsWith('.prepare-')))
    })
  test('never overwrites a damaged existing bundle', async ({ assert }) => {
    const release = await fixture()
    const result = await prepareRollbackBundle({ root, release, releaseId, source })
    await writeFile(join(result.directory, 'lib/applicationRollback.mjs'), 'damaged')
    await assert.rejects(() => prepareRollbackBundle({ root, release, releaseId, source }), 'rollback_bundle_integrity_mismatch')
    assert.equal(await readFile(join(result.directory, 'lib/applicationRollback.mjs'), 'utf8'), 'damaged')
  })
  test('rejects symlinked maintenance directories and roots inside the source release', async ({ assert }) => {
    const release = await fixture()
    await mkdir(join(root, 'elsewhere'))
    await symlink(join(root, 'elsewhere'), join(root, 'maintenance'))
    await assert.rejects(() => prepareRollbackBundle({ root, release, releaseId, source }), 'unsafe_rollback_bundle_directory')
    await assert.rejects(() => prepareRollbackBundle({ root: release, release, releaseId, source }), 'rollback_bundle_root_inside_release')
  })
  test('capture CLI prepares the stable bundle bound to its captured release identity', async ({ assert }) => {
    await fixture()
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--root', root, '--prepare-rollback-bundle'], { encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    const output = result.stdout.split('\n')[0]
    const deployment = JSON.parse(await readFile(join(output, 'deployment.json'), 'utf8'))
    const bundle = join(root, 'maintenance/rollback', deployment.current.identity)
    assert.equal((await verifyRollbackBundle(bundle)).releaseId, deployment.current.identity)
    assert.include(result.stdout, `Rollback bundle ready: ${bundle}`)
    assert.isTrue((await readdir(root)).includes('spendcraft.new'))
  }).timeout(30000)
  test('capture CLI fails closed before swap when a transitive dependency is missing', async ({ assert }) => {
    const release = await fixture()
    await rm(join(release, 'node_modules/fixture-runtime'), { recursive: true })
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--root', root, '--prepare-rollback-bundle'], { encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'prepare-rollback-bundle')
    assert.isTrue((await readdir(root)).includes('spendcraft.new'))
    const directories = await readdir(join(root, 'maintenance/rollback'))
    assert.isTrue(directories.every((name) => name.startsWith('.prepare-')))
  })
  test('read-only inspection cannot request bundle writes', async ({ assert }) => {
    await fixture()
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--inspect-root', root, '--prepare-rollback-bundle'], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'bundle_requires_deployment_capture')
    assert.notInclude(await readdir(root), 'maintenance')
    assert.notInclude(await readdir(root), 'releases')
  })
  test('managed launcher upgrades preserve old launcher versions and refuse manual shell edits', async ({ assert }) => {
    const release = await fixture()
    await prepareRollbackBundle({ root, release, releaseId, source })
    const shellPath = join(root, 'maintenance/rollback.sh')
    const previous = await readFile(shellPath, 'utf8')
    const oldId = /^LAUNCHER_ID=([a-f0-9]{64})$/m.exec(previous)[1]
    const launcher = join(release, 'installer/launchRollback.mjs')
    await writeFile(launcher, (await readFile(launcher, 'utf8')) + '\n// updated launcher\n')
    await prepareRollbackBundle({ root, release, releaseId: 'c'.repeat(64), source })
    assert.notEqual(await readFile(shellPath, 'utf8'), previous)
    assert.equal(await readFile(join(root, 'maintenance/rollback', `launcher-${oldId}/rollback.sh`), 'utf8'), previous)
    await writeFile(shellPath, '# custom operator script\n')
    await assert.rejects(() => prepareRollbackBundle({ root, release, releaseId: 'd'.repeat(64), source }), 'unmanaged_rollback_shell')
    assert.equal(await readFile(shellPath, 'utf8'), '# custom operator script\n')
  })
  test('installer requests the bundle before deleting or swapping application releases', async ({ assert }) => {
    const installer = await readFile('installer/install.sh0', 'utf8')
    const call = installer.indexOf('node "$PWD/$APP_NEW/installer/captureDeploymentManifests.mjs"')
    assert.isAbove(call, 0)
    assert.include(installer.slice(call, installer.indexOf('\n', call)), '--prepare-rollback-bundle')
    assert.isBelow(call, installer.indexOf('\nrm -fr $APP_OLD'))
    const config = await readFile('adonisrc.ts', 'utf8')
    for (const file of ['pm2-processes.json', 'lib/pm2Processes.mjs', 'rollbackApplication.mjs', 'prepareRollbackBundle.mjs', 'lib/applicationRollback.mjs', 'lib/releaseManifest.mjs', 'lib/rollbackBundleIntegrity.mjs', 'launchRollback.mjs', 'rollback.sh']) {
      assert.include(config, `pattern: 'installer/${file}'`)
    }
  })
})
