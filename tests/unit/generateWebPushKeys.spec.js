import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, symlink, lstat, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { createECDH } from 'node:crypto'
import { Buffer } from 'node:buffer'
import GenerateWebPushKeys from '../../commands/GenerateWebPushKeys.js'

test.group('Web push key generation (temporary files, no application or database)', (group) => {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-vapid-'))
    await mkdir(join(root, 'release'))
    await symlink('../shared-env', join(root, 'release/.env'))
    return () => rm(root, { recursive: true, force: true })
  })
  async function run() {
    const messages = []
    const command = {
      app: { appRoot: pathToFileURL(join(root, 'release/')) }, exitCode: 0,
      logger: { info: (message) => messages.push(message), error: (message) => messages.push(message) },
    }
    await GenerateWebPushKeys.prototype.run.call(command)
    return { messages, exitCode: command.exitCode }
  }
  test('generates a matching pair for missing or empty keys and preserves existing contents').with([
    '# preserve\nPG_DB_NAME=example',
    'VAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=""\n',
    '# VAPID_PUBLIC_KEY=comment\r\nPG_DB_NAME=example\r\n',
    'VAPID_PUBLIC_KEY=\n',
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original, { mode: 0o600 })
    const result = await run()
    const contents = await readFile(join(root, 'shared-env'), 'utf8')
    const env = parseEnv(contents)
    assert.equal(result.exitCode, 0)
    for (const [name, value] of Object.entries(parseEnv(original))) {
      if (!name.startsWith('VAPID_')) assert.equal(env[name], value)
    }
    for (const line of original.split(/\r?\n/).filter((entry) => entry.startsWith('#'))) assert.include(contents, line)
    assert.match(env.VAPID_PUBLIC_KEY, /^[A-Za-z0-9_-]{87}$/)
    assert.match(env.VAPID_PRIVATE_KEY, /^[A-Za-z0-9_-]{43}$/)
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(env.VAPID_PRIVATE_KEY, 'base64url'))
    assert.equal(ecdh.getPublicKey().toString('base64url'), env.VAPID_PUBLIC_KEY)
    assert.notInclude(result.messages.join('\n'), env.VAPID_PRIVATE_KEY)
    assert.notInclude(result.messages.join('\n'), env.VAPID_PUBLIC_KEY)
    assert.isTrue((await lstat(join(root, 'release/.env'))).isSymbolicLink())
    assert.equal((await stat(join(root, 'shared-env'))).mode & 0o777, 0o600)
    assert.equal((await run()).exitCode, 0)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
  })
  test('preserves existing pairs byte-for-byte, including quoted exported assignments', async ({ assert }) => {
    const original = 'export VAPID_PUBLIC_KEY="existing-public"\nVAPID_PRIVATE_KEY=existing-private\n'
    await writeFile(join(root, 'shared-env'), original)
    assert.equal((await run()).exitCode, 0)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
  })
  test('refuses a partial pair without replacing the configured key').with([
    'VAPID_PUBLIC_KEY=existing-public\n',
    'VAPID_PRIVATE_KEY=existing-private\nVAPID_PUBLIC_KEY=\n',
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original)
    const result = await run()
    assert.equal(result.exitCode, 1)
    assert.include(result.messages.join('\n'), 'Only one VAPID key is configured')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
  })
  test('EnvEditor writes empty example placeholders without exposing generated secrets', async ({ assert }) => {
    await writeFile(join(root, 'shared-env'), 'PG_DB_NAME=example\n')
    await writeFile(join(root, 'release/.env.example'), '# example\nPG_DB_NAME=\n')
    assert.equal((await run()).exitCode, 0)
    const env = parseEnv(await readFile(join(root, 'shared-env'), 'utf8'))
    const example = await readFile(join(root, 'release/.env.example'), 'utf8')
    assert.deepEqual(parseEnv(example), { PG_DB_NAME: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' })
    assert.notInclude(example, env.VAPID_PRIVATE_KEY)
    assert.notInclude(example, env.VAPID_PUBLIC_KEY)
  })
  test('missing .env fails without creating a file', async ({ assert }) => {
    await assert.rejects(() => run())
    await assert.rejects(() => readFile(join(root, 'shared-env')))
  })
})
