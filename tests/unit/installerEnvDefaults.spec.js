import { test } from '@japa/runner'
import process from 'node:process'
import { mkdtemp, mkdir, readFile, writeFile, symlink, lstat, stat, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parseEnv } from 'node:util'
import { configureRequiredEnvironment } from '../../scripts/configureInstallerEnv.mjs'

const commonValues = {
  SESSION_DRIVER: 'cookie', HASH_DRIVER: 'bcrypt', PLAID_PRODUCTS: 'transactions',
  PLAID_COUNTRY_CODES: 'US', PLAID_WEBHOOK: '', MAIL_CONNECTION: 'smtp', MAIL_ENCRYPTION: 'tls',
  MAIL_FROM_ADDRESS: 'noreply@spendcraft.app', MAIL_FROM_NAME: 'SpendCraft',
  REDIS_CONNECTION: 'local', REDIS_HOST: '127.0.0.1', REDIS_PORT: '6379',
  ACCESS_TOKEN_EXPIRE: '10', REFRESH_TOKEN_EXPIRE: '1440',
}
const metadata = Object.entries(commonValues).map(([name, value]) => ({ name, type: 'value', value }))

test.group('Installer consolidated automatic values (temporary files only)', (group) => {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-env-values-'))
    return () => rm(root, { recursive: true, force: true })
  })
  async function fixture(contents, requirements = metadata) {
    const release = join(root, 'spendcraft.new')
    await mkdir(release)
    if (contents !== null) await writeFile(join(root, 'spendcraft-env'), contents, { mode: 0o600 })
    await symlink('../spendcraft-env', join(release, '.env'))
    if (requirements !== null) await writeFile(join(release, 'installer.env.required.json'), JSON.stringify(requirements))
    return () => spawnSync(process.execPath, [resolve('scripts/configureInstallerEnv.mjs'), '--target', 'staging', '--env-file', '.env', '--requirements', 'installer.env.required.json'], {
      cwd: release, env: { PATH: process.env.PATH }, encoding: 'utf8',
    })
  }
  test('all former defaults are present as automatic values in the consolidated metadata', async ({ assert }) => {
    const required = JSON.parse(await readFile('installer.env.required.json', 'utf8'))
    for (const [name, value] of Object.entries(commonValues)) {
      const matches = required.filter((entry) => entry.name === name)
      assert.lengthOf(matches, 1)
      assert.equal(matches[0].type, 'value')
      assert.include(['string', 'number'], typeof matches[0].value)
      assert.strictEqual(String(matches[0].value), value)
    }
    const run = await fixture('', required.filter((entry) => entry.type === 'value'))
    const result = run()
    assert.equal(result.status, 0, result.stderr)
    const env = parseEnv(await readFile(join(root, 'spendcraft-env'), 'utf8'))
    for (const [name, value] of Object.entries(commonValues)) assert.equal(env[name], value)
    for (const entry of required.filter((item) => item.type === 'value')) {
      assert.equal(env[entry.name], String(typeof entry.value === 'object' ? entry.value.staging : entry.value))
    }
  })
  test('adds automatic values without a terminal, preserves secrets, symlink and permissions, and is idempotent', async ({ assert }) => {
    const original = '# Keep this comment\nAPP_KEY="private-key"\nPG_PASSWORD="private-password"'
    const run = await fixture(original)
    const result = run()
    assert.equal(result.status, 0, result.stderr)
    const contents = await readFile(join(root, 'spendcraft-env'), 'utf8')
    assert.isTrue(contents.startsWith(original + '\n'))
    assert.deepEqual(parseEnv(contents), { APP_KEY: 'private-key', PG_PASSWORD: 'private-password', ...commonValues })
    assert.isTrue((await lstat(join(root, 'spendcraft.new/.env'))).isSymbolicLink())
    assert.equal((await stat(join(root, 'spendcraft-env'))).mode & 0o777, 0o600)
    assert.notInclude(result.stdout + result.stderr, 'private-key')
    assert.notInclude(result.stdout + result.stderr, 'private-password')
    assert.equal(run().status, 0)
    assert.equal(await readFile(join(root, 'spendcraft-env'), 'utf8'), contents)
  })
  test('existing conflicting automatic values abort without overwriting any configuration').with([
    'SESSION_DRIVER=memory\nHASH_DRIVER=argon\n',
    'PLAID_WEBHOOK=https://example.invalid/webhook\n',
    'MAIL_FROM_ADDRESS=other@example.invalid\n',
  ]).run(async ({ assert }, original) => {
    const run = await fixture(original)
    const result = run()
    assert.equal(result.status, 1, result.stderr)
    assert.include(result.stderr, 'configured value is not allowed for staging')
    assert.equal(await readFile(join(root, 'spendcraft-env'), 'utf8'), original)
  })
  test('fills empty placeholders and preserves exported matching assignments and CRLF', async ({ assert }) => {
    const original = '# HASH_DRIVER=argon\r\nexport SESSION_DRIVER="cookie"\r\nHASH_DRIVER=\r\nPLAID_WEBHOOK=\r\n'
    const run = await fixture(original, metadata.filter((entry) => ['SESSION_DRIVER', 'HASH_DRIVER', 'PLAID_WEBHOOK'].includes(entry.name)))
    assert.equal(run().status, 0)
    assert.equal(await readFile(join(root, 'spendcraft-env'), 'utf8'), original + 'HASH_DRIVER="bcrypt"\r\n')
  })
  test('missing target file fails without creating a new environment', async ({ assert }) => {
    await fixture(null)
    await assert.rejects(() => configureRequiredEnvironment({
      target: 'staging', envFile: join(root, 'spendcraft.new/.env'),
      requirementsFile: join(root, 'spendcraft.new/installer.env.required.json'),
    }), 'Cannot read .env or its symlink target')
    await assert.rejects(() => readFile(join(root, 'spendcraft-env')))
  })
  test('missing or malformed metadata fails without changing the environment').with([
    null, [{ name: 'SESSION_DRIVER', type: 'value', value: 'bad$interpolation' }],
    [{ name: 'SESSION_DRIVER', type: 'value', value: true }],
  ]).run(async ({ assert }, requirements) => {
    const original = 'APP_KEY=preserve\n'
    const run = await fixture(original, requirements)
    assert.equal(run().status, 1)
    assert.equal(await readFile(join(root, 'spendcraft-env'), 'utf8'), original)
  })
  test('installer packages only consolidated metadata and initializes configuration before application commands', async ({ assert }) => {
    await assert.rejects(() => readFile('installer.env.defaults'))
    const config = await readFile('adonisrc.ts', 'utf8')
    assert.include(config, "pattern: 'installer.env.required.json'")
    assert.notInclude(config, "pattern: 'installer.env.defaults'")
    const installer = await readFile('install.sh0', 'utf8')
    assert.notInclude(installer, 'ensure_env_defaults')
    const call = installer.indexOf('\nnode scripts/configureInstallerEnv.mjs')
    assert.isAbove(call, installer.indexOf('\nnpm ci --omit dev --omit optional'))
    assert.isAbove(call, installer.indexOf('\nensure_app_key\n'))
    assert.isBelow(call, installer.indexOf('\nnode ace migration:status'))
  })
})
