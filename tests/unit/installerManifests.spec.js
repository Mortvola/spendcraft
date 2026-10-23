import { test } from '@japa/runner'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath, readdir, stat, lstat, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { recordDeployment, writeBuildSource } from '../../installer/captureDeploymentManifests.mjs'
import { main as generateRollbackPlan } from '../../installer/generateRollbackPlan.mjs'
import { releaseManifest } from '../../installer/lib/releaseManifest.mjs'

test.group('Installer release manifests (temporary packages, no services or database)', (group) => {
  let root
  group.each.setup(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'spendcraft-installer-manifests-')))
    return () => rm(root, { recursive: true, force: true })
  })
  async function release(name, source = false) {
    const directory = join(root, name)
    for (const folder of ['bin', 'node_modules', 'public/assets/.vite', 'config', 'app/Models', 'commands']) {
      await mkdir(join(directory, folder), { recursive: true })
    }
    for (const file of ['bin/server.js', 'ace.js', 'config/database.js', 'app/Models/Transaction.js',
      'commands/QueueListener.js', 'commands/PlaidCleanupListener.js']) await writeFile(join(directory, file), '// fixture')
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'spendcraft', type: 'module', dependencies: {} }))
    await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ name: 'spendcraft', lockfileVersion: 3 }))
    await writeFile(join(directory, 'public/assets/.vite/manifest.json'), JSON.stringify({
      'client-src/App.tsx': { isEntry: true, file: 'App.js' },
    }))
    await writeFile(join(directory, 'public/assets/App.js'), '// fixture')
    await writeFile(join(root, 'spendcraft-env'), 'not-a-real-credential')
    await symlink('../spendcraft-env', join(directory, '.env'))
    if (source) await writeBuildSource(join(directory, 'release-source.json'), (args) => args[0] === 'rev-parse' ? 'a'.repeat(40) : '')
    return directory
  }
  test('captures previous and prepared releases using the rollback manifest format', async ({ assert }) => {
    const previous = await release('spendcraft')
    const current = await release('spendcraft.new', true)
    const printed = []
    const { output, record } = await recordDeployment(root, (path) => printed.push(path))
    assert.deepEqual(printed, [output])
    assert.equal(record.status, 'captured-before-swap')
    assert.deepEqual(JSON.parse(await readFile(join(output, 'previous-release-manifest.json'), 'utf8')), await releaseManifest(previous))
    assert.deepEqual(JSON.parse(await readFile(join(output, 'current-release-manifest.json'), 'utf8')), await releaseManifest(current))
    assert.isNull(record.previous.source)
    assert.equal(record.previous.installedPathAfterSwap, join(root, 'spendcraft.old'))
    assert.equal(record.current.source.commit, 'a'.repeat(40))
    assert.isFalse(record.current.source.dirty)
    assert.equal((await stat(output)).mode & 0o777, 0o700)
    assert.notInclude(await readFile(join(output, 'deployment.json'), 'utf8'), 'not-a-real-credential')
  })
  test('fresh install automatically publishes unavailable plan without PM2 or database access', async ({ assert }) => {
    await release('spendcraft.new', true)
    await rename(join(root, 'spendcraft.new'), join(root, 'spendcraft'))
    await generateRollbackPlan(['--root', root, '--target', 'staging'])
    const plan = JSON.parse(await readFile(join(root, 'maintenance/rollback-plan.json'), 'utf8'))
    assert.equal(plan.unavailableReason, 'no_previous_installed_release')
    assert.equal(plan.root, root)
  })
  test('fresh installation records that no previous release exists', async ({ assert }) => {
    await release('spendcraft.new', true)
    const { output, record } = await recordDeployment(root, () => undefined)
    assert.isNull(record.previous)
    assert.notInclude(await readdir(output), 'previous-release-manifest.json')
  })
  test('repeated capture creates unique records without overwriting earlier results', async ({ assert }) => {
    await release('spendcraft.new', true)
    const first = await recordDeployment(root, () => undefined)
    const original = await readFile(join(first.output, 'deployment.json'), 'utf8')
    const second = await recordDeployment(root, () => undefined)
    assert.notEqual(first.output, second.output)
    assert.equal(await readFile(join(first.output, 'deployment.json'), 'utf8'), original)
  })
  test('invalid previous/current releases fail and never produce a completed record').with(['spendcraft', 'spendcraft.new'])
    .run(async ({ assert }, invalid) => {
      await release('spendcraft'); await release('spendcraft.new', true)
      await rm(join(root, invalid, 'ace.js'))
      let output
      await assert.rejects(() => recordDeployment(root, (path) => { output = path }), 'incomplete_release')
      assert.notInclude(await readdir(output), 'deployment.json')
      assert.isTrue((await stat(join(root, 'spendcraft'))).isDirectory())
    })
  test('missing build identity fails closed before the swap', async ({ assert }) => {
    await release('spendcraft.new')
    await assert.rejects(() => recordDeployment(root, () => undefined))
  })
  test('records dirty source truthfully and refuses to overwrite build identity', async ({ assert }) => {
    const path = join(root, 'release-source.json')
    const git = (args) => args[0] === 'rev-parse' ? 'b'.repeat(40) : ' M app/example.ts'
    await writeBuildSource(path, git)
    assert.isTrue(JSON.parse(await readFile(path, 'utf8')).dirty)
    await assert.rejects(() => writeBuildSource(path, git))
    await assert.rejects(() => writeBuildSource(join(root, 'bad.json'), () => 'not-a-commit'), 'invalid_build_commit')
  })
  test('actual installer stops before directory deletion/swap if capture fails', async ({ assert }) => {
    const source = await readFile('installer/install.sh0', 'utf8')
    const call = source.indexOf('node "$PWD/$APP_NEW/installer/captureDeploymentManifests.mjs"')
    const end = source.indexOf('\nconfirm_deployment RESUME', call)
    assert.isAbove(call, source.indexOf('\nseed_database\n'))
    assert.isAbove(call, source.indexOf('--action stop'))
    assert.isAbove(call, source.indexOf('npm ci --omit dev --omit optional'))
    assert.isBelow(call, source.indexOf('rm -fr $APP_OLD'))
    const excerpt = source.slice(call, end)
    for (const captureStatus of [0, 1]) {
      const result = spawnSync('bash', ['-c', `set -e
node() { return ${captureStatus}; }
rm() { printf 'DELETE_REACHED\\n'; }
mv() { printf 'SWAP_REACHED\\n'; }
APP_NEW=spendcraft.new
APP_OLD=spendcraft.old
APP=spendcraft
${excerpt}
`], { cwd: root, encoding: 'utf8' })
      assert.equal(result.status, captureStatus)
      if (captureStatus) { assert.notInclude(result.stdout, 'SWAP_REACHED'); assert.notInclude(result.stdout, 'DELETE_REACHED') }
      else assert.include(result.stdout, 'SWAP_REACHED')
    }
  })
  test('capture tooling is packaged and build metadata is generated before deployment packaging', async ({ assert }) => {
    const configuration = await readFile('adonisrc.ts', 'utf8')
    assert.include(configuration, "pattern: 'installer/captureDeploymentManifests.mjs'")
    assert.include(configuration, "pattern: 'installer/lib/releaseManifest.mjs'")
    const build = await readFile('build.sh', 'utf8')
    assert.isAbove(build.indexOf('--write-build-source'), build.indexOf('npm run server-build'))
    assert.isAbove(build.indexOf('releasePackage.mjs package'), build.indexOf('--write-build-source'))
    assert.notInclude(await readFile('deploy.sh', 'utf8'), './build.sh')
  })
  test('CLI prints deployment folder and never needs database settings', async ({ assert }) => {
    await release('spendcraft.new', true)
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--root', root],
      { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.isTrue(result.stdout.trim().startsWith(join(root, 'releases/deployment-')))
  })
  test('CLI diagnostics identify incomplete release and offending file without revealing secrets', async ({ assert }) => {
    await release('spendcraft'); await release('spendcraft.new', true)
    await rm(join(root, 'spendcraft/ace.js'))
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--root', root], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    const diagnostic = JSON.parse(result.stderr.split('\n').find((line) => line.startsWith('Diagnostic: ')).slice('Diagnostic: '.length))
    assert.deepEqual(diagnostic, { phase: 'capture-previous-release', path: join(root, 'spendcraft'), code: 'incomplete_release', entry: 'ace.js' })
    assert.notInclude(result.stderr, 'not-a-real-credential')
    const output = result.stdout.trim()
    assert.notInclude(await readdir(output), 'deployment.json')
  })
  test('read-only inspection identifies broken secret links without creating deployment records', async ({ assert }) => {
    await release('spendcraft.new', true)
    await symlink('../missing-push-key', join(root, 'spendcraft.new/PushNotificationKey.p8'))
    const before = await readdir(root)
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--inspect-root', root], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    const diagnostic = JSON.parse(result.stderr.split('\n').find((line) => line.startsWith('Diagnostic: ')).slice('Diagnostic: '.length))
    assert.deepEqual(diagnostic, { phase: 'capture-current-release', path: join(root, 'spendcraft.new'), code: 'ENOENT', entry: 'PushNotificationKey.p8' })
    assert.deepEqual(await readdir(root), before)
    assert.notInclude(result.stderr, 'not-a-real-credential')
  })
  test('read-only inspection validates releases and build identity without writing records', async ({ assert }) => {
    await release('spendcraft'); await release('spendcraft.new', true)
    const before = await readdir(root)
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--inspect-root', root], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.include(result.stdout, 'Release inspection passed')
    assert.deepEqual(await readdir(root), before)
    assert.notInclude(await readdir(root), 'releases')
  })
  test('invalid build JSON diagnostic excludes raw file content', async ({ assert }) => {
    await release('spendcraft.new', true)
    await writeFile(join(root, 'spendcraft.new/release-source.json'), 'not-json-private-marker')
    const result = spawnSync(process.execPath, [resolve('installer/captureDeploymentManifests.mjs'), '--inspect-root', root], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'read-current-build-identity')
    assert.include(result.stderr, 'invalid_json')
    assert.notInclude(result.stderr, 'not-json-private-marker')
  })

  test('installer links the optional Apple key only when its target is a file')
    .with(['present', 'missing', 'directory', 'dangling']).run(async ({ assert }, state) => {
      const current = await release('spendcraft.new', true)
      const key = join(root, 'PushNotificationKey.p8')
      if (state === 'present') await writeFile(key, 'synthetic-private-key')
      if (state === 'directory') await mkdir(key)
      if (state === 'dangling') await symlink('missing-key', key)
      const source = await readFile('installer/install.sh0', 'utf8')
      const start = source.indexOf('if [ -f ../PushNotificationKey.p8 ]; then')
      assert.isAbove(start, 0)
      const end = source.indexOf('\nfi', start) + 3
      const result = spawnSync('bash', ['-c', `set -e\n${source.slice(start, end)}\n`], { cwd: current, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      const link = join(current, 'PushNotificationKey.p8')
      if (state === 'present') {
        assert.isTrue((await lstat(link)).isSymbolicLink())
        assert.equal(await realpath(link), key)
      } else await assert.rejects(() => lstat(link))
      const manifest = await releaseManifest(current)
      assert.notInclude(JSON.stringify(manifest), 'synthetic-private-key')
    })

})
