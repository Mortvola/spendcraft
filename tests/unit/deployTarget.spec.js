import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, realpath, symlink } from 'node:fs/promises'
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
      assert.include(result.installer, 'INSTALL_TARGET="$SPENDCRAFT_ENV"')
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
    .with([['staging'], ['production'], ['unknown'], ['staging', 'extra']]).run(async ({ assert }, args) => {
      const source = await readFile('installer/install.sh0', 'utf8')
      const header = source.slice(0, source.indexOf('\nconfirm_deployment() {'))
      const result = spawnSync('/bin/bash', ['-c', header, 'install.sh', ...args], {
        encoding: 'utf8', env: { PATH: '/nonexistent', INSTALL_TARGET: 'production' },
      })
      assert.equal(result.status, 1)
      assert.include(result.stderr, 'Usage: install.sh (no arguments)')
      assert.equal(result.stdout, '')
    })
})

test.group('Server-local installer and login-shell configuration (temporary files only)', () => {
  async function runConfiguration(options = {}) {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'server-environment-')))
    try {
      const server = join(directory, 'server'); await mkdir(server)
      const configDirectory = join(directory, 'config'); await mkdir(configDirectory)
      let file = join(configDirectory, 'environment')
      const target = options.target ?? 'staging'
      const contents = options.contents ?? `SPENDCRAFT_ENV=${target}\nSPENDCRAFT_ROOT=${server}\n`
      if (!options.missing) await writeFile(file, contents, { mode: 0o644 })
      if (options.mode !== undefined) await chmod(file, options.mode)
      if (options.directoryMode !== undefined) await chmod(configDirectory, options.directoryMode)
      if (options.symlinkFile) {
        await writeFile(join(configDirectory, 'original'), contents)
        await rm(file)
        await symlink(join(configDirectory, 'original'), file)
      }
      if (options.symlinkDirectory) {
        await symlink(configDirectory, join(directory, 'linked'))
        file = join(directory, 'linked/environment')
      }
      // Simulate root ownership only; modes and symlinks use the real temporary filesystem.
      const statCommand = join(directory, 'stat-fixture')
      await writeFile(statCommand, '#!' + process.execPath + '\nconst fs=require("node:fs");const p=process.argv.at(-1);process.stdout.write((process.env.TEST_BAD_OWNER ? "1000" : "0")+":"+(fs.statSync(p).mode & 0o7777).toString(8)+"\\n");\n', { mode: 0o700 })
      const source = await readFile('installer/install.sh0', 'utf8')
      let script
      if (options.profile) {
        const guide = await readFile('installer/Installation.md', 'utf8')
        const snippet = guide.split('<!-- spendcraft-profile-start -->')[1].split('<!-- spendcraft-profile-end -->')[0]
        script = snippet.split('```sh\n')[1].split('```')[0]
      } else script = source.slice(0, source.indexOf('\nconfirm_deployment() {'))
      const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
      script = script.replaceAll('/etc/spendcraft/environment', file)
        .replaceAll('/usr/bin/stat', quote(statCommand))
      // A child shell confirms these are exports, not merely local assignments.
      script += `\n/bin/sh -c 'printf "%s|%s" "$SPENDCRAFT_ENV" "$SPENDCRAFT_ROOT"'\n`
      const result = spawnSync('/bin/bash', ['-c', script, 'install.sh'], { encoding: 'utf8',
        env: { PATH: process.env.PATH, SPENDCRAFT_ENV: 'production', SPENDCRAFT_ROOT: '/inherited/incorrect',
          INSTALL_TARGET: 'production', ...(options.badOwner ? { TEST_BAD_OWNER: '1' } : {}) } })
      return { ...result, server }
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
  test('installer reads either server configuration without arguments or inherited overrides')
    .with(['staging', 'production']).run(async ({ assert }, target) => {
      const result = await runConfiguration({ target })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout, target + '|' + result.server)
    })
  test('login snippet parses data and exports authoritative values')
    .with(['staging', 'production']).run(async ({ assert }, target) => {
      const result = await runConfiguration({ target, profile: true })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout, target + '|' + result.server)
    })
  test('rejects missing, duplicate, unknown, malformed and unsafe settings')
    .with([
      { missing: true }, { contents: '' },
      { contents: 'SPENDCRAFT_ENV=staging\n' },
      { contents: 'SPENDCRAFT_ROOT=/tmp\n' },
      { contents: 'SPENDCRAFT_ENV=other\nSPENDCRAFT_ROOT=/tmp\n' },
      { contents: 'SPENDCRAFT_ENV=staging\nSPENDCRAFT_ROOT=relative\n' },
      { contents: 'SPENDCRAFT_ENV=staging\nSPENDCRAFT_ENV=staging\nSPENDCRAFT_ROOT=/tmp\n' },
      { contents: 'SPENDCRAFT_ENV=staging\nSPENDCRAFT_ROOT=/tmp\nSPENDCRAFT_ROOT=/tmp\n' },
      { contents: 'SPENDCRAFT_ENV=staging\nSPENDCRAFT_ROOT=/tmp\nOTHER=value\n' },
      { contents: 'SPENDCRAFT_ENV =staging\nSPENDCRAFT_ROOT=/tmp\n' },
      { contents: 'SPENDCRAFT_ENV="staging"\nSPENDCRAFT_ROOT=/tmp\n' },
      { contents: 'SPENDCRAFT_ENV=staging\nSPENDCRAFT_ROOT=/tmp/$(false)\n' },
      { contents: 'SPENDCRAFT_ENV=staging\nSPENDCRAFT_ROOT=/tmp\n\n' },
      { mode: 0o666 }, { mode: 0o664 }, { mode: 0o755 }, { directoryMode: 0o777 },
      { badOwner: true }, { symlinkFile: true }, { symlinkDirectory: true },
    ]).run(async ({ assert }, options) => {
      const result = await runConfiguration(options)
      assert.equal(result.status, 1)
      assert.notEqual(result.stderr, '')
      assert.equal(result.stdout, '')
    })
  test('profile reports unknown entries without executing them', async ({ assert }) => {
    const result = await runConfiguration({ profile: true, contents: 'UNKNOWN=value\n' })
    assert.equal(result.stdout, 'production|/inherited/incorrect')
    assert.include(result.stderr, 'Invalid SpendCraft environment setting: UNKNOWN')
  })
  test('deploy uploads only and never executes installation or overrides server settings', async ({ assert }) => {
    const source = await readFile('deploy.sh', 'utf8')
    assert.notMatch(source, /\bssh\b|SPENDCRAFT_ENV=|SPENDCRAFT_ROOT=|\/etc\/spendcraft/)
  })
})
