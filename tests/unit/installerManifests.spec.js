import { test } from '@japa/runner'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { recordDeployment, writeBuildSource } from '../../scripts/captureDeploymentManifests.mjs'
import { releaseManifest } from '../../scripts/lib/releaseManifest.mjs'

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
    const source = await readFile('install.sh0', 'utf8')
    const call = source.indexOf('node "$PWD/$APP_NEW/scripts/captureDeploymentManifests.mjs"')
    const end = source.indexOf('\nconfirm_deployment RESUME', call)
    assert.isAbove(call, source.indexOf('\nseed_database\n'))
    assert.isAbove(call, source.indexOf('pm2 stop plaid-cleanup'))
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
    assert.include(configuration, "pattern: 'scripts/captureDeploymentManifests.mjs'")
    assert.include(configuration, "pattern: 'scripts/lib/releaseManifest.mjs'")
    const build = await readFile('build.sh', 'utf8')
    assert.isAbove(build.indexOf('--write-build-source'), build.indexOf('npm run server-build'))
    assert.include(await readFile('deploy.sh', 'utf8'), './build.sh')
  })
  test('CLI prints deployment folder and never needs database settings', async ({ assert }) => {
    await release('spendcraft.new', true)
    const result = spawnSync(process.execPath, [resolve('scripts/captureDeploymentManifests.mjs'), '--root', root],
      { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.isTrue(result.stdout.trim().startsWith(join(root, 'releases/deployment-')))
  })
})
