import { test } from '@japa/runner'
import process from 'node:process'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'

test.group('Installer key commands through real Ace bootstrap (isolated application, no database)',
  (group) => {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-key-bootstrap-'))
    for (const dir of ['commands', 'bin', 'start']) await mkdir(join(root, dir))
    await symlink(resolve('node_modules'), join(root, 'node_modules'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', imports: {
      '#start/env': './start/env.ts' } }))
    for (const file of ['adonisrc.ts', 'bin/console.ts', 'commands/GenerateWebPushKeys.ts',
      'commands/GenerateJwtKeys.ts', 'commands/RotatePlaidCleanupKeys.ts']) {
      await writeFile(join(root, file), await readFile(file))
    }
    await writeFile(join(root, 'ace.js'),
      "import '@poppinss/ts-exec'; await import('./bin/console.js')\n")
    // Discovery must not import unrelated commands before settings are ready.
    await writeFile(join(root, 'start/env.ts'), `import { Env } from '@adonisjs/core/env'
export default await Env.create(new URL('../', import.meta.url), { NOT_CONFIGURED_YET: \
Env.schema.string() })
`)
    await writeFile(join(root, 'commands/Unrelated.ts'), `import '../start/env.js'
import { BaseCommand } from '@adonisjs/core/ace'
export default class Unrelated extends BaseCommand { static commandName = 'unrelated' }
`)
    await writeFile(join(root, '.env'), '# configuration intentionally incomplete\n', {
      mode: 0o600 })
    return () => rm(root, { recursive: true, force: true })
  })
  function run(command) {
    return spawnSync(process.execPath, ['ace.js', ...command], {
      cwd: root, encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH, NODE_ENV: 'production', ENV_PATH: '', FORCE_COLOR: '0' },
    })
  }
  test('APP_KEY, VAPID and JWT initialize without discovery or booting full environment validation',
    async ({ assert }) => {
    for (const args of [['generate:key', '--force'], ['generate:web-push-keys'], [
      'generate:jwt-keys'], ['plaid:rotate-cleanup-keys', '--if-missing']]) {
      const result = run(args)
      assert.equal(result.status, 0, result.stdout + result.stderr)
      assert.notInclude(result.stdout + result.stderr, 'EnvValidationException')
    }
    const contents = await readFile(join(root, '.env'), 'utf8')
    const env = parseEnv(contents)
    for (const name of ['APP_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'JWT_PUBLIC_KEY',
      'JWT_PRIVATE_KEY']) assert.isNotEmpty(env[name])
    assert.isUndefined(env.NOT_CONFIGURED_YET)
    assert.equal(env.PLAID_CLEANUP_KEY_VERSION, 'v1')
    for (const command of ['generate:web-push-keys', 'generate:jwt-keys']) assert.equal(run([
      command]).status, 0)
    assert.equal(run(['plaid:rotate-cleanup-keys', '--if-missing']).status, 0)
    assert.equal(await readFile(join(root, '.env'), 'utf8'), contents)
    // The unrelated command still triggers validation: no global bypass exists.
    const unrelated = run(['unrelated'])
    assert.notEqual(unrelated.status, 0)
    assert.include(unrelated.stdout + unrelated.stderr, 'EnvValidationException')
  }).timeout(30000)
  test('original discovery reproduces validation failure before keys can be generated', async ({
    assert }) => {
    const path = join(root, 'adonisrc.ts')
    const source = await readFile(path, 'utf8')
    const withoutRegistration = source.replace(
      / {4}async \(\) => new ListLoader\(\[[\s\S]*?\]\),\n/, '')
    assert.notEqual(withoutRegistration, source)
    await writeFile(path, withoutRegistration)
    const original = await readFile(join(root, '.env'), 'utf8')
    const result = run(['generate:web-push-keys'])
    assert.notEqual(result.status, 0)
    assert.include(result.stdout + result.stderr, 'EnvValidationException')
    assert.equal(await readFile(join(root, '.env'), 'utf8'), original)
  }).timeout(30000)

  test('cleanup key rotation is available through Ace before full environment validation', async ({
    assert }) => {
    const result = run(['plaid:rotate-cleanup-keys'])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const env = parseEnv(await readFile(join(root, '.env'), 'utf8'))
    assert.equal(env.PLAID_CLEANUP_KEY_VERSION, 'v1')
    assert.match(JSON.parse(env.PLAID_CLEANUP_KEYS).v1, /^[A-Za-z0-9+/]{43}=$/)
    assert.isUndefined(env.NOT_CONFIGURED_YET)
  }).timeout(30000)

})
