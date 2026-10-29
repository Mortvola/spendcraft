import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, symlink, lstat, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { EnvParser } from '@adonisjs/core/env'
import { AES256GCM } from '@adonisjs/core/encryption/drivers/aes_256_gcm'
import RotatePlaidCleanupKeys from '../../commands/RotatePlaidCleanupKeys.js'

const oldKey = 'synthetic-existing-secret-at-least-32-characters'

test.group('Plaid cleanup key rotation (temporary files, no app, database or provider)', (group) =>
  {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-cleanup-keys-'))
    await mkdir(join(root, 'release'))
    await symlink('../shared-env', join(root, 'release/.env'))
    return () => rm(root, { recursive: true, force: true })
  })
  async function run(ifMissing = false) {
    const messages = []
    const command = {
      app: { appRoot: pathToFileURL(join(root, 'release/')) }, exitCode: 0, ifMissing,
      logger: { info: (message) => messages.push(message), error: (message) => messages.push(
        message) },
    }
    await RotatePlaidCleanupKeys.prototype.run.call(command)
    return { messages, exitCode: command.exitCode }
  }
  test('initializes v1 and rotates to v2, retaining keys and keeping example secrets empty').with([
    '# preserve\nOTHER=value\n', 'PLAID_CLEANUP_KEYS=\nPLAID_CLEANUP_KEY_VERSION=\n',
    "PLAID_CLEANUP_KEYS='{}'\n",
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original, { mode: 0o600 })
    await writeFile(join(root, 'release/.env.example'), '# example\n')
    const first = await run()
    assert.equal(first.exitCode, 0)
    const env = parseEnv(await readFile(join(root, 'shared-env'), 'utf8'))
    assert.equal(env.PLAID_CLEANUP_KEY_VERSION, 'v1')
    const keys = JSON.parse(env.PLAID_CLEANUP_KEYS)
    assert.match(keys.v1, /^[A-Za-z0-9+/]{43}=$/)
    assert.notInclude(first.messages.join('\n'), keys.v1)
    const cipher = new AES256GCM({ id: 'plaid-cleanup-v1', key: keys.v1 }).encrypt(
      'synthetic-token')
    assert.equal((await run()).exitCode, 0)
    const contents = await readFile(join(root, 'shared-env'), 'utf8')
    const updated = parseEnv(contents)
    const adonis = await new EnvParser(contents, pathToFileURL(root + '/'), {
      ignoreProcessEnv: true }).parse()
    assert.equal(adonis.PLAID_CLEANUP_KEYS, updated.PLAID_CLEANUP_KEYS)
    assert.equal(updated.PLAID_CLEANUP_KEY_VERSION, 'v2')
    const retained = JSON.parse(updated.PLAID_CLEANUP_KEYS)
    assert.equal(retained.v1, keys.v1)
    assert.notEqual(retained.v2, retained.v1)
    assert.equal(new AES256GCM({ id: 'plaid-cleanup-v1', key: retained.v1 }).decrypt(cipher),
      'synthetic-token')
    assert.isTrue((await lstat(join(root, 'release/.env'))).isSymbolicLink())
    assert.equal((await stat(join(root, 'shared-env'))).mode & 0o777, 0o600)
    assert.deepEqual(parseEnv(await readFile(join(root, 'release/.env.example'), 'utf8')), {
      PLAID_CLEANUP_KEYS: '', PLAID_CLEANUP_KEY_VERSION: '',
    })
    if (parseEnv(original).OTHER) assert.equal(updated.OTHER, 'value')
  })
  test('uses highest existing version, preserves custom legacy IDs, and never overwrites a key',
    async ({ assert }) => {
    const keys = { v1: oldKey, v9: oldKey + 'nine', legacy: oldKey + 'legacy' }
    await writeFile(join(root, 'shared-env'),
      `PLAID_CLEANUP_KEY_VERSION=v1\nPLAID_CLEANUP_KEYS='${JSON.stringify(keys)}'\n`)
    assert.equal((await run()).exitCode, 0)
    const env = parseEnv(await readFile(join(root, 'shared-env'), 'utf8'))
    assert.equal(env.PLAID_CLEANUP_KEY_VERSION, 'v10')
    const updated = JSON.parse(env.PLAID_CLEANUP_KEYS)
    for (const [version, key] of Object.entries(keys)) assert.equal(updated[version], key)
    assert.lengthOf(Object.keys(updated), 4)
  })
  test('rejects malformed or inconsistent configuration without saving').with([
    'PLAID_CLEANUP_KEYS=not-json\n',
    "PLAID_CLEANUP_KEYS='[]'\n", "PLAID_CLEANUP_KEYS='null'\n",
    'PLAID_CLEANUP_KEY_VERSION=v1\n',
    "PLAID_CLEANUP_KEYS='{\"v1\":\"short\"}'\n",
    `PLAID_CLEANUP_KEYS='{"v9007199254740991":"${oldKey}"}'\n`,
    `PLAID_CLEANUP_KEYS='{"v9007199254740992":"${oldKey}"}'\n`,
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original)
    const result = await run()
    assert.equal(result.exitCode, 1)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
    assert.notInclude(result.messages.join('\n'), oldKey)
  })
  test('missing .env fails without creating one', async ({ assert }) => {
    assert.equal((await run()).exitCode, 1)
    await assert.rejects(() => readFile(join(root, 'shared-env')))
  })
  test('if-missing initializes once and never rotates an existing configured pair').with([
    '# new configuration\n', 'PLAID_CLEANUP_KEYS=\nPLAID_CLEANUP_KEY_VERSION=\n',
    "PLAID_CLEANUP_KEYS='{}'\n",
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original)
    assert.equal((await run(true)).exitCode, 0)
    const first = await readFile(join(root, 'shared-env'), 'utf8')
    assert.equal(parseEnv(first).PLAID_CLEANUP_KEY_VERSION, 'v1')
    assert.equal((await run(true)).exitCode, 0)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), first)
  })
  test('if-missing preserves an existing selected version and all retained keys', async ({
    assert }) => {
    const original = `# preserve\nPLAID_CLEANUP_KEY_VERSION=v2\nPLAID_CLEANUP_KEYS='${JSON
      .stringify({ v1: oldKey, v2: oldKey + 'two' })}'\n`
    await writeFile(join(root, 'shared-env'), original)
    assert.equal((await run(true)).exitCode, 0)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
  })
  test('if-missing rejects partial or malformed configuration without inventing a replacement')
    .with([
    'PLAID_CLEANUP_KEY_VERSION=v1\n',
    `PLAID_CLEANUP_KEYS='${JSON.stringify({ v1: oldKey })}'\n`,
    'PLAID_CLEANUP_KEYS=invalid-json\n',
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original)
    assert.equal((await run(true)).exitCode, 1)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
  })

})
