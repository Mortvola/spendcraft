import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { packageRelease } from '../../installer/releasePackage.mjs'

async function runDeploy(args, variables = {}, corrupt = false) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'spendcraft deploy target ')))
  try {
    await mkdir(join(directory, 'build'))
    await mkdir(join(directory, 'installer'))
    await writeFile(join(directory, 'installer/install.sh0'), await readFile('installer/install.sh0', 'utf8'))
    await writeFile(join(directory, 'build/application.js'), '// tested application')
    await writeFile(join(directory, 'build/release-source.json'), JSON.stringify({ format: 1,
      commit: 'a'.repeat(40), dirty: false, builtAt: '2026-10-22T00:00:00.000Z' }))
    const release = await packageRelease(directory, () => undefined)
    if (corrupt) {
      await chmod(join(release.directory, 'build.zip'), 0o600)
      await writeFile(join(release.directory, 'build.zip'), 'modified since staging acceptance')
    }
    const upload = join(directory, 'uploaded.sh')
    const result = spawnSync('bash', ['-c', `
scp() { cp "$3" "$UPLOAD_CAPTURE"; printf 'UPLOAD_KEY:%s\\nUPLOAD_DEST:%s\\n' "$2" "$4"; }
source "$1" "\${@:2}"
`, 'deploy-test', resolve('deploy.sh'), ...args.map((arg) => arg === '<release>' ? release.directory : arg)], {
      cwd: directory,
      env: { PATH: process.env.PATH, TMPDIR: directory, UPLOAD_CAPTURE: upload, ...variables },
      encoding: 'utf8',
    })
    const installer = result.status === 0 ? await readFile(upload, 'utf8') : null
    return { ...result, installer, release: release.manifest }
  } finally { await rm(directory, { recursive: true, force: true }) }
}

const configuration = {
  SPENDCRAFT_SERVER: 'production.example', SPENDCRAFT_SSH_KEY: '/keys/production key.pem',
  SPENDCRAFT_STAGING_SERVER: 'staging.example', SPENDCRAFT_STAGING_SSH_KEY: '/keys/staging key.pem',
}

test.group('Deploy saved release target selection (mock upload, no build/network)', () => {
  test('uploads the selected saved release with the correct target and quoted key path')
    .with(['production', 'staging']).run(async ({ assert }, target) => {
      const result = await runDeploy(['<release>', target], configuration)
      assert.equal(result.status, 0, result.stderr)
      assert.include(result.stdout, 'Verified release ID: ' + result.release.id)
      assert.include(result.stdout, `UPLOAD_KEY:/keys/${target} key.pem\nUPLOAD_DEST:ubuntu@${target}.example:`)
      assert.include(result.installer, 'production|staging) INSTALL_TARGET="$1"')
      assert.notInclude(result.stdout, 'BUILD')
    })
  test('rejects missing, invalid or extra arguments before packaging/upload')
    .with([[], ['production'], ['<release>', 'test'], ['<release>', 'production', 'extra']]).run(async ({ assert }, args) => {
      const result = await runDeploy(args, configuration)
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.include(result.stderr, 'RELEASE_DIRECTORY production|staging')
    })
  test('rejects missing or empty selected configuration before upload')
    .with(Object.keys(configuration)).run(async ({ assert }, variable) => {
      const variables = { ...configuration, [variable]: '' }
      const target = variable.includes('STAGING') ? 'staging' : 'production'
      const result = await runDeploy(['<release>', target], variables)
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.include(result.stderr, variable)
    })
  test('does not require the other environment configuration')
    .with(['production', 'staging']).run(async ({ assert }, target) => {
      const variables = Object.fromEntries(Object.entries(configuration).filter(([key]) => key.includes('STAGING') === (target === 'staging')))
      const result = await runDeploy(['<release>', target], variables)
      assert.equal(result.status, 0, result.stderr)
    })
  test('rejects a modified application archive before scp', async ({ assert }) => {
    const result = await runDeploy(['<release>', 'production'], configuration, true)
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'release_checksum_mismatch')
    assert.notInclude(result.stdout, 'UPLOAD_')
  })
  test('deploy never invokes build, npm, zip or the live installer template', async ({ assert }) => {
    const source = await readFile('deploy.sh', 'utf8')
    assert.notInclude(source, './build.sh')
    assert.notMatch(source, /\bnpm\b|\bzip -|installer\/install\.sh0/)
    assert.include(source, '--release "$1" --output')
    assert.notInclude(source, '--target')
  })
  test('unified installer rejects invalid arguments before installation')
    .with([[], ['unknown'], ['staging', 'extra'], ['production', 'staging']]).run(async ({ assert }, args) => {
      const source = await readFile('installer/install.sh0', 'utf8')
      const header = source.slice(0, source.indexOf('\nconfirm_deployment() {'))
      const result = spawnSync('/bin/bash', ['-c', header, 'install.sh', ...args], {
        encoding: 'utf8', env: { PATH: '/nonexistent', INSTALL_TARGET: 'production' },
      })
      assert.equal(result.status, 1)
      assert.include(result.stderr, 'Usage: install.sh staging|production')
      assert.equal(result.stdout, '')
    })
})

test.group('Unified installer runtime target selection (header only, no install)', () => {
  test('accepts exactly one target and overrides any inherited target')
    .with(['staging', 'production']).run(async ({ assert }, target) => {
      const directory = await realpath(await mkdtemp(join(tmpdir(), 'installer-target-')))
      try {
        const source = await readFile('installer/install.sh0', 'utf8')
        const header = source.slice(0, source.indexOf('\nconfirm_deployment() {'))
        const result = spawnSync('/bin/bash', ['-c', header + '\nprintf "%s\\n" "$INSTALL_TARGET"',
          'install.sh', target], { encoding: 'utf8', env: { SPENDCRAFT_ROOT: directory, INSTALL_TARGET: 'incorrect' } })
        assert.equal(result.status, 0, result.stderr)
        assert.equal(result.stdout, target + '\n')
      } finally { await rm(directory, { recursive: true, force: true }) }
    })
})
