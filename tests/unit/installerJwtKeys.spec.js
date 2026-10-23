import { test } from '@japa/runner'
import process from 'node:process'
import { mkdtemp, mkdir, writeFile, readFile, symlink, lstat, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { parseEnv, TextEncoder } from 'node:util'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { EnvParser } from '@adonisjs/core/env'
import GenerateJwtKeys from '../../commands/GenerateJwtKeys.js'

test.group('Installer JWT key generation (temporary files, no app or database)', (group) => {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-jwt-test-'))
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
    await GenerateJwtKeys.prototype.run.call(command)
    return { messages, exitCode: command.exitCode }
  }
  test('ssh-keygen creates an RS256-compatible PEM pair parsed by Node and Adonis').with([
    '# preserve\nPG_DB_NAME=example\n',
    'JWT_PRIVATE_KEY=""\nJWT_PUBLIC_KEY=\n',
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original, { mode: 0o600 })
    await writeFile(join(root, 'release/.env.example'), '# example\n')
    const result = await run()
    assert.equal(result.exitCode, 0, result.messages.join('\n'))
    const contents = await readFile(join(root, 'shared-env'), 'utf8')
    const env = parseEnv(contents)
    const parsed = await new EnvParser(contents, pathToFileURL(join(root, 'release/')), { ignoreProcessEnv: true }).parse()
    assert.equal(parsed.JWT_PRIVATE_KEY, env.JWT_PRIVATE_KEY)
    assert.equal(parsed.JWT_PUBLIC_KEY, env.JWT_PUBLIC_KEY)
    // Same decoding used in config/auth.ts before passing keys to JwtGuard.
    const privateKey = createPrivateKey(parsed.JWT_PRIVATE_KEY.replace(/\\\\n/g, '\n'))
    const publicKey = createPublicKey(parsed.JWT_PUBLIC_KEY.replace(/\\\\n/g, '\n'))
    assert.equal(privateKey.asymmetricKeyType, 'rsa')
    assert.equal(privateKey.asymmetricKeyDetails.modulusLength, 3072)
    assert.isTrue(verify('RSA-SHA256', new TextEncoder().encode('synthetic payload'), publicKey,
      sign('RSA-SHA256', new TextEncoder().encode('synthetic payload'), privateKey)))
    if (parseEnv(original).PG_DB_NAME) assert.equal(env.PG_DB_NAME, 'example')
    assert.notInclude(result.messages.join('\n'), env.JWT_PRIVATE_KEY)
    assert.isTrue((await lstat(join(root, 'release/.env'))).isSymbolicLink())
    assert.equal((await stat(join(root, 'shared-env'))).mode & 0o777, 0o600)
    const example = await readFile(join(root, 'release/.env.example'), 'utf8')
    assert.deepEqual(parseEnv(example), { JWT_PRIVATE_KEY: '', JWT_PUBLIC_KEY: '' })
    assert.notInclude(example, 'BEGIN RSA PRIVATE KEY')
    assert.equal((await run()).exitCode, 0)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
  })
  test('existing pair is preserved without requiring ssh-keygen', async ({ assert }) => {
    const contents = 'JWT_PRIVATE_KEY=existing-private\nJWT_PUBLIC_KEY=existing-public\n'
    await writeFile(join(root, 'shared-env'), contents)
    assert.equal((await run()).exitCode, 0)
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
  })
  test('partial pair fails without modifying any keys').with([
    'JWT_PRIVATE_KEY=private\n', 'JWT_PUBLIC_KEY=public\nJWT_PRIVATE_KEY=\n',
  ]).run(async ({ assert }, original) => {
    await writeFile(join(root, 'shared-env'), original)
    const result = await run()
    assert.equal(result.exitCode, 1)
    assert.include(result.messages.join('\n'), 'Only one JWT key is configured')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
  })
  test('missing ssh-keygen aborts without writing the environment', async ({ assert }) => {
    const original = 'PG_DB_NAME=example\n'
    await writeFile(join(root, 'shared-env'), original)
    const oldPath = process.env.PATH
    try {
      process.env.PATH = root
      const result = await run()
      assert.equal(result.exitCode, 1)
      assert.include(result.messages.join('\n'), 'ssh-keygen availability')
      assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
    } finally {
      if (oldPath === undefined) delete process.env.PATH
      else process.env.PATH = oldPath
    }
  })
  test('missing environment is not silently created', async ({ assert }) => {
    await assert.rejects(() => run())
    await assert.rejects(() => readFile(join(root, 'shared-env')))
  })
  test('installer invokes generation before prompting and omits JWT prompts', async ({ assert }) => {
    const source = await readFile('installer/install.sh0', 'utf8')
    const call = source.indexOf('\nENV_PATH= NODE_ENV=production node ace generate:jwt-keys\n')
    assert.isAbove(call, source.indexOf('\nensure_app_key\n'))
    assert.isBelow(call, source.indexOf('\nnode installer/configureInstallerEnv.mjs'))
    const entries = JSON.parse(await readFile('installer/installer.env.required.json', 'utf8'))
    assert.isFalse(entries.some((entry) => entry.name.startsWith('JWT_')))
  })
})
