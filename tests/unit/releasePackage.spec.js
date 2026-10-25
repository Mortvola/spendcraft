import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink, readdir, cp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { packageRelease, verifyPackage, createInstaller } from '../../installer/releasePackage.mjs'

const source = { format: 1, commit: 'a'.repeat(40), dirty: false, builtAt: '2026-10-22T00:00:00.000Z' }
function payload(installer) { return Buffer.from(installer.split('\n___END_OF_SHELL_SCRIPT___\n')[1], 'base64') }
test.group('Saved release packaging and promotion (local files only)', (group) => {
  let root
  group.each.setup(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'spendcraft release package ')))
    await mkdir(join(root, 'build'))
    await mkdir(join(root, 'installer'))
    await writeFile(join(root, 'build/release-source.json'), JSON.stringify(source))
    await writeFile(join(root, 'build/app.js'), '// synthetic app')
    await writeFile(join(root, 'installer/install.sh0'), await readFile('installer/install.sh0', 'utf8'))
    return () => rm(root, { recursive: true, force: true })
  })
  test('creates unique saved releases without replacing earlier packages', async ({ assert }) => {
    const first = await packageRelease(root, () => undefined)
    const bytes = await readFile(join(first.directory, 'build.zip'))
    const second = await packageRelease(root, () => undefined)
    assert.notEqual(first.directory, second.directory)
    assert.deepEqual(await readFile(join(first.directory, 'build.zip')), bytes)
    assert.equal((await verifyPackage(first.directory)).id, first.manifest.id)
    assert.deepEqual(first.manifest.source, source)
    const embedded = spawnSync('unzip', ['-p', join(first.directory, 'build.zip'), 'build/release-source.json'], { encoding: 'utf8' })
    assert.equal(embedded.status, 0)
    assert.deepEqual(JSON.parse(embedded.stdout), source)
  })
  test('one installer preserves the saved archive and is identical for either runtime target', async ({ assert }) => {
    await writeFile(join(root, 'build/random.bin'), randomBytes(250001))
    const release = await packageRelease(root, () => undefined)
    const original = await readFile(join(release.directory, 'build.zip'))
    await writeFile(join(root, 'installer/install.sh0'), 'a completely different installer')
    await writeFile(join(root, 'build/app.js'), '// later untested source')
    const output = join(root, 'install.sh')
    const actual = await createInstaller(release.directory, output)
    assert.equal(actual.id, release.manifest.id)
    const script = await readFile(output, 'utf8')
    assert.include(script, 'production|staging) INSTALL_TARGET="$1"')
    assert.deepEqual(payload(script), original)
    assert.notInclude(script, 'INSTALL_TARGET=production\n')
    assert.notInclude(script, 'INSTALL_TARGET=staging\n')
    assert.equal((await verifyPackage(release.directory)).id, release.manifest.id)
  })
  test('generator rejects obsolete target-specific packaging options', async ({ assert }) => {
    const release = await packageRelease(root, () => undefined)
    const output = join(root, 'install.sh')
    const result = spawnSync(process.execPath, [resolve('installer/releasePackage.mjs'), 'installer',
      '--release', release.directory, '--target', 'staging', '--output', output], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    await assert.rejects(() => readFile(output))
  })
  test('modified template, archive or source metadata is rejected', async ({ assert }) => {
    for (const name of ['build.zip', 'install.sh0', 'release-source.json']) {
      const release = await packageRelease(root, () => undefined)
      await chmod(join(release.directory, name), 0o600)
      await writeFile(join(release.directory, name), 'tampered')
      await assert.rejects(() => verifyPackage(release.directory), 'release_checksum_mismatch')
    }
  })
  test('manifest tampering and incomplete packages fail closed', async ({ assert }) => {
    const release = await packageRelease(root, () => undefined)
    await chmod(join(release.directory, 'release.json'), 0o600)
    await writeFile(join(release.directory, 'release.json'), JSON.stringify({ ...release.manifest, id: 'b'.repeat(64) }))
    await assert.rejects(() => verifyPackage(release.directory), 'release_manifest_identity_mismatch')
    const incomplete = join(root, 'incomplete'); await mkdir(incomplete)
    await assert.rejects(() => verifyPackage(incomplete))
  })
  test('rejects a linked archive without creating an installer', async ({ assert }) => {
    const release = await packageRelease(root, () => undefined)
    const archive = join(release.directory, 'build.zip')
    await writeFile(join(root, 'other.zip'), await readFile(archive))
    await rm(archive); await symlink(join(root, 'other.zip'), archive)
    await assert.rejects(() => verifyPackage(release.directory), 'release_file_must_be_regular')
    await assert.rejects(() => createInstaller(release.directory, join(root, 'output.sh')), 'release_file_must_be_regular')
  })
  test('does not overwrite output installers or write generated files into the saved package', async ({ assert }) => {
    const release = await packageRelease(root, () => undefined)
    const existing = join(root, 'existing.sh'); await writeFile(existing, 'keep')
    await assert.rejects(() => createInstaller(release.directory, existing))
    assert.equal(await readFile(existing, 'utf8'), 'keep')
    await assert.rejects(() => createInstaller(release.directory, join(release.directory, 'install.sh')), 'installer_output_inside_release')
    await symlink(release.directory, join(root, 'release-alias'))
    await assert.rejects(() => createInstaller(release.directory, join(root, 'release-alias/install.sh')), 'installer_output_inside_release')
  })
  test('invalid template cannot become an eligible release', async ({ assert }) => {
    await writeFile(join(root, 'installer/install.sh0'), 'no target guard or payload delimiter')
    await assert.rejects(() => packageRelease(root, () => undefined), 'invalid_installer_template')
  })
  test('build.sh installs checkout-local locked dependencies before building and packaging', async ({ assert }) => {
    await cp('installer', join(root, 'installer'), { recursive: true })
    await writeFile(join(root, 'build.sh'), await readFile('build.sh', 'utf8'))
    const bin = join(root, 'bin'); await mkdir(bin)
    await writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3,"fixture":"committed"}\n')
    await writeFile(join(bin, 'npm'), `#!/bin/bash
case "$*" in
  ci)
    [ "$PWD" = "$EXPECTED_ROOT" ] || exit 91
    [ "$(cat package-lock.json)" = '{"lockfileVersion":3,"fixture":"committed"}' ] || exit 92
    mkdir node_modules
    printf 'INSTALL_CHECKOUT_DEPENDENCIES\\n'
    ;;
  'run server-build')
    [ -d node_modules ] && [ ! -L node_modules ] || exit 93
    rm -rf build
    mkdir -p build
    printf 'synthetic app' > build/app.js
    printf 'BUILD\\n'
    ;;
  *) exit 94 ;;
esac
`, { mode: 0o700 })
    await writeFile(join(bin, 'git'), '#!/bin/bash\ncase "$1" in\n diff) exit 0 ;;\n rev-parse) printf "' + 'a'.repeat(40) + '\\n" ;;\n status) exit 0 ;;\n *) exit 99 ;;\nesac\n', { mode: 0o700 })
    const result = spawnSync('bash', [join(root, 'build.sh')], { cwd: tmpdir(), env: { PATH: bin + ':' + process.env.PATH, EXPECTED_ROOT: root }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.split('BUILD').length - 1, 1)
    assert.isBelow(result.stdout.indexOf('INSTALL_CHECKOUT_DEPENDENCIES'), result.stdout.indexOf('BUILD'))
    assert.equal(await readFile(join(root, 'package-lock.json'), 'utf8'), '{"lockfileVersion":3,"fixture":"committed"}\n')
    assert.include(result.stdout, 'Release package: ')
    const directories = await readdir(join(root, 'releases'))
    assert.lengthOf(directories, 1)
    const release = await verifyPackage(join(root, 'releases', directories[0]))
    assert.equal(release.source.commit, source.commit)
    assert.isFalse(release.source.dirty)
  })
  test('a failed build does not package or upload', async ({ assert }) => {
    await cp('installer', join(root, 'installer'), { recursive: true })
    await writeFile(join(root, 'build.sh'), await readFile('build.sh', 'utf8'))
    const bin = join(root, 'bin'); await mkdir(bin)
    await writeFile(join(bin, 'npm'), '#!/bin/bash\nif [ "$*" = ci ]; then exit 0; fi\nexit 7\n', { mode: 0o700 })
    await writeFile(join(bin, 'git'), '#!/bin/bash\n[ "$1" = diff ]\n', { mode: 0o700 })
    const result = spawnSync('bash', [join(root, 'build.sh')], { env: { PATH: bin + ':' + process.env.PATH }, encoding: 'utf8' })
    assert.equal(result.status, 7)
    assert.notInclude(result.stdout, 'Release package:')
    await assert.rejects(() => readdir(join(root, 'releases')))
  })
  test('dependency isolation failures stop before building or packaging')
    .with(['symlink', 'manifest', 'install']).run(async ({ assert }, failure) => {
      await writeFile(join(root, 'build.sh'), await readFile('build.sh', 'utf8'))
      const bin = join(root, 'bin'); await mkdir(bin)
      await writeFile(join(bin, 'git'), '#!/bin/bash\nexit ' + (failure === 'manifest' ? '1' : '0') + '\n', { mode: 0o700 })
      await writeFile(join(bin, 'npm'), '#!/bin/bash\nprintf "NPM:%s\\n" "$*"\nexit 8\n', { mode: 0o700 })
      if (failure === 'symlink') {
        await mkdir(join(root, 'development-dependencies'))
        await writeFile(join(root, 'development-dependencies/sentinel'), 'preserve')
        await symlink(join(root, 'development-dependencies'), join(root, 'node_modules'))
      }
      const result = spawnSync('bash', [join(root, 'build.sh')], {
        env: { PATH: bin + ':' + process.env.PATH }, encoding: 'utf8',
      })
      assert.equal(result.status, failure === 'install' ? 8 : 1)
      assert.notInclude(result.stdout, 'run server-build')
      assert.notInclude(result.stdout, 'Release package:')
      if (failure === 'install') assert.include(result.stdout, 'NPM:ci')
      else assert.notInclude(result.stdout, 'NPM:')
      if (failure === 'symlink') {
        assert.include(result.stderr, 'symlinked node_modules')
        assert.equal(await readFile(join(root, 'development-dependencies/sentinel'), 'utf8'), 'preserve')
      }
      if (failure === 'manifest') assert.include(result.stderr, 'must match the committed HEAD')
      await assert.rejects(() => readdir(join(root, 'releases')))
    })
  test('deploy script references only existing release packaging, not a build', async ({ assert }) => {
    const script = await readFile(resolve('deploy.sh'), 'utf8')
    assert.notInclude(script, './build.sh')
    assert.include(script, 'releasePackage.mjs" installer')
  })
})
