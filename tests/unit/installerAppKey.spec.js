import { test } from '@japa/runner'
import process from 'node:process'
import { mkdtemp, mkdir, readFile, writeFile, symlink, lstat, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

test.group('Installer APP_KEY initialization (temporary files, no app or database)', (group) => {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-app-key-'))
    return () => rm(root, { recursive: true, force: true })
  })
  async function run(contents) {
    const release = join(root, 'spendcraft.new')
    await mkdir(release)
    if (contents !== null) await writeFile(join(root, 'spendcraft-env'), contents, { mode: 0o600 })
    await symlink('../spendcraft-env', join(release, '.env'))
    // Invoke the actual installed framework key-generation method without
    // bootstrapping SpendCraft. Only its logger and application root are inert.
    const command = pathToFileURL(resolve('node_modules/@adonisjs/core/build/commands/generate_key.js')).href
    await writeFile(join(release, 'ace'), `
import GenerateKey from ${JSON.stringify(command)};
import { writeFile } from 'node:fs/promises';
await writeFile('invoked.json', JSON.stringify(process.argv.slice(2)));
await GenerateKey.prototype.run.call({ force:process.argv.includes('--force'), show:false,
  app:{appRoot:new URL('./',import.meta.url)},logger:{action(){return {succeeded(){}}},log(){throw Error('Key must not be printed')}} });
`)
    const source = await readFile('installer/install.sh0', 'utf8')
    const start = source.indexOf('ensure_app_key() {')
    const end = source.indexOf('\nseed_database() {', start)
    return spawnSync('bash', ['-c', `set -e\n${source.slice(start, end)}\nensure_app_key\n`], {
      cwd: release, env: { PATH: process.env.PATH, ENV_PATH: '/must-not-be-used', NODE_ENV: 'production' }, encoding: 'utf8',
    })
  }
  test('creates a key for absent, empty or commented settings and preserves the shared symlink').with([
    'PG_DB_NAME=example\n', 'APP_KEY=\nPG_DB_NAME=example\n', 'APP_KEY=""\nPG_DB_NAME=example\n', '# APP_KEY=comment-only\nPG_DB_NAME=example\n',
  ]).run(async ({ assert }, input) => {
    const result = await run(input)
    assert.equal(result.status, 0, result.stderr)
    const env = parseEnv(await readFile(join(root, 'spendcraft-env'), 'utf8'))
    assert.match(env.APP_KEY, /^[a-zA-Z0-9_-]{32}$/)
    assert.equal(env.PG_DB_NAME, 'example')
    assert.isTrue((await lstat(join(root, 'spendcraft.new/.env'))).isSymbolicLink())
    assert.deepEqual(JSON.parse(await readFile(join(root, 'spendcraft.new/invoked.json'), 'utf8')), ['generate:key', '--force'])
    assert.notInclude(result.stdout + result.stderr, env.APP_KEY)
  })
  test('preserves existing keys byte-for-byte without invoking generation').with([
    'APP_KEY=existing-private-key\nPG_DB_NAME=example\n',
    'export APP_KEY="existing-private-key"\nPG_DB_NAME=example\n',
  ]).run(async ({ assert }, input) => {
    const result = await run(input)
    assert.equal(result.status, 0)
    assert.equal(await readFile(join(root, 'spendcraft-env'), 'utf8'), input)
    await assert.rejects(() => readFile(join(root, 'spendcraft.new/invoked.json')))
    assert.notInclude(result.stdout + result.stderr, 'existing-private-key')
  })
  test('missing environment file fails closed without creating one', async ({ assert }) => {
    const result = await run(null)
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'APP_KEY was not changed')
    await assert.rejects(() => readFile(join(root, 'spendcraft-env')))
  })
  test('key initialization follows dependency installation and precedes app migration bootstrap', async ({ assert }) => {
    const source = await readFile('installer/install.sh0', 'utf8')
    const call = source.indexOf('\nensure_app_key\n')
    assert.isAbove(call, source.indexOf('\nnpm ci --omit dev --omit optional'))
    assert.isBelow(call, source.indexOf('\nnode ace migration:status'))
  })
  test('installer generates APP_KEY then VAPID/JWT/cleanup keys before prompts and stops on key-generation failure')
    .with([0, 1, 2, 3]).run(async ({ assert }, pushStatus) => {
      const source = await readFile('installer/install.sh0', 'utf8')
      const start = source.indexOf('\nensure_app_key\n')
      const end = source.indexOf('\npopd', start)
      assert.isAbove(start, 0)
      assert.isAbove(end, start)
      const result = spawnSync('bash', ['-c', `set -e
INSTALL_TARGET=staging
ensure_app_key() { printf 'APP_KEY\\n'; }
node() {
  if [ "$*" = 'ace generate:web-push-keys' ]; then
    printf 'VAPID\\n'
    [ "$ENV_PATH" = '' ] && [ "$NODE_ENV" = production ] || return 99
    return ${pushStatus === 1 ? 1 : 0}
  fi
  if [ "$*" = 'ace generate:jwt-keys' ]; then printf 'JWT\\n'; return ${pushStatus === 2 ? 2 : 0}; fi
  if [ "$*" = 'ace plaid:rotate-cleanup-keys --if-missing' ]; then printf 'CLEANUP\\n'; return ${pushStatus === 3 ? 3 : 0}; fi
  if [ "$1" = installer/configureInstallerEnv.mjs ]; then printf 'CONFIGURE\\n'; return 0; fi
  return 98
}
${source.slice(start, end)}
`], { encoding: 'utf8', env: { PATH: process.env.PATH, ENV_PATH: '/must-not-be-used' } })
      assert.equal(result.status, pushStatus, result.stderr)
      assert.equal(result.stdout, pushStatus === 0 ? 'APP_KEY\nVAPID\nJWT\nCLEANUP\nCONFIGURE\n' : pushStatus === 1 ? 'APP_KEY\nVAPID\n' : pushStatus === 2 ? 'APP_KEY\nVAPID\nJWT\n' : 'APP_KEY\nVAPID\nJWT\nCLEANUP\n')
      const required = JSON.parse(await readFile('installer/installer.env.required.json', 'utf8'))
      assert.isFalse(required.some((entry) => entry.name.startsWith('VAPID_') || entry.name.startsWith('JWT_') || entry.name.startsWith('PLAID_CLEANUP_KEY')))
    })

})
