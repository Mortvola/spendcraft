import { test } from '@japa/runner'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const script = resolve('backup.sh')
const valid = 'PG_HOST=localhost\nPG_PORT=5432\nPG_USER=staging_user\nPG_PASSWORD="private-test-password"\nPG_DB_NAME=spendcraft_staging\n'

test.group('Packaged installer backup (mock pg_dump only)', (group) => {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-backup-'))
    return () => rm(root, { recursive: true, force: true })
  })
  async function run(config = valid, behavior = 'success', args) {
    const bin = join(root, 'bin')
    await mkdir(bin, { recursive: true })
    const capture = join(root, 'invocation.json')
    await writeFile(join(bin, 'pg_dump'), `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args:process.argv.slice(2),password:process.env.PGPASSWORD,inheritedDatabase:process.env.PGDATABASE}));
process.stdout.write(${JSON.stringify(behavior === 'empty' ? '' : '-- synthetic dump\n')});
process.stderr.write(${JSON.stringify('private diagnostic\n')});
${behavior === 'failure' ? 'process.exitCode=7;' : behavior === 'signal' ? "process.kill(process.pid,'SIGTERM');" : ''}
`, { mode: 0o700 })
    await writeFile(join(root, 'settings.env'), config)
    return spawnSync('bash', [script, ...(args ?? ['--env-file', join(root, 'settings.env'), '--output-parent', join(root, 'backups')])], {
      cwd: root, env: { PATH: `${bin}:${process.env.PATH}`, PGDATABASE: 'must_not_be_used' }, encoding: 'utf8',
    })
  }
  test('uses .env target, publishes private dump and summary, and preserves earlier backups', async ({ assert }) => {
    await mkdir(join(root, 'backups'))
    await writeFile(join(root, 'backups', 'backup.sql'), 'old backup')
    const first = await run()
    assert.equal(first.status, 0, first.stderr)
    const output = first.stdout.trim().split('\n')[0]
    assert.isTrue(output.startsWith(join(root, 'backups', 'database-backup-')))
    const summary = JSON.parse(await readFile(join(output, 'summary.json'), 'utf8'))
    assert.equal(summary.status, 'complete')
    assert.deepEqual(summary.target, { host: 'localhost', port: 5432, user: 'staging_user', database: 'spendcraft_staging' })
    assert.equal(summary.bytes, Buffer.byteLength('-- synthetic dump\n'))
    assert.match(summary.sha256, /^[a-f0-9]{64}$/)
    assert.equal((await stat(output)).mode & 0o777, 0o700)
    for (const file of ['backup.sql', 'summary.json', 'pg_dump.stderr.log']) assert.equal((await stat(join(output, file))).mode & 0o777, 0o600)
    assert.notInclude(await readdir(output), 'backup.sql.partial')
    const invoked = JSON.parse(await readFile(join(root, 'invocation.json'), 'utf8'))
    assert.deepEqual(invoked.args, ['--format=plain', '--no-password', '--host', 'localhost', '--port', '5432', '--username', 'staging_user', '--dbname', 'spendcraft_staging'])
    assert.equal(invoked.password, 'private-test-password')
    assert.notProperty(invoked, 'inheritedDatabase')
    assert.notInclude(first.stdout + first.stderr + JSON.stringify(summary), 'private-test-password')
    assert.notInclude(first.stdout + first.stderr, 'private diagnostic')
    const second = await run()
    assert.equal(second.status, 0)
    assert.notEqual(second.stdout.split('\n')[0], output)
    assert.equal(await readFile(join(root, 'backups', 'backup.sql'), 'utf8'), 'old backup')
  })
  test('dump failure, interruption or empty output cannot publish a complete backup')
    .with(['failure', 'signal', 'empty']).run(async ({ assert }, behavior) => {
      const result = await run(valid, behavior)
      assert.equal(result.status, 1)
      const output = result.stdout.trim()
      const files = await readdir(output)
      assert.include(files, 'backup.sql.partial')
      assert.notInclude(files, 'backup.sql')
      assert.notInclude(files, 'summary.json')
    })
  test('invalid or missing configuration cannot invoke pg_dump').with([
    valid.replace('PG_PORT=5432', 'PG_PORT=0'),
    valid.replace('PG_PORT=5432', 'PG_PORT=abc'),
    valid.replace('PG_DB_NAME=spendcraft_staging', 'PG_DB_NAME=postgresql://wrong-target'),
    valid.replace('PG_PASSWORD="private-test-password"\n', ''),
    valid.replace('PG_HOST=localhost', 'PG_HOST='),
  ]).run(async ({ assert }, config) => {
    const result = await run(config)
    assert.equal(result.status, 1)
    assert.notInclude(await readdir(root), 'invocation.json')
    assert.notInclude(result.stdout + result.stderr, 'private-test-password')
  })
  test('requires explicit paths before doing any database work', async ({ assert }) => {
    const result = await run(valid, 'success', [])
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.notInclude(await readdir(root), 'invocation.json')
  })
  test('configuration diagnostics identify fields without disclosing their values').with([
    [valid.replace('PG_PASSWORD="private-test-password"\n', ''), 'Missing required environment setting(s): PG_PASSWORD'],
    [valid.replace('PG_PORT=5432\n', '').replace('PG_USER=staging_user\n', ''), 'Missing required environment setting(s): PG_PORT, PG_USER'],
    [valid.replace('PG_PORT=5432', 'PG_PORT=private-invalid-value'), 'PG_PORT (integer from 1 to 65535 required)'],
    [valid.replace('PG_DB_NAME=spendcraft_staging', 'PG_DB_NAME=private-invalid-value'), 'PG_DB_NAME (letters, digits and underscores only)'],
    [valid.replace('PG_HOST=localhost', 'PG_HOST='), 'PG_HOST (hostname or IP address required)'],
  ]).run(async ({ assert }, [config, expected]) => {
    const result = await run(config)
    assert.equal(result.status, 1)
    assert.include(result.stderr, expected)
    assert.notInclude(result.stdout + result.stderr, 'private-test-password')
    assert.notInclude(result.stdout + result.stderr, 'private-invalid-value')
    assert.notInclude(await readdir(root), 'invocation.json')
  })
  test('missing environment file reports ENOENT and suggests checking its path', async ({ assert }) => {
    const result = await run(valid, 'success', ['--env-file', join(root, 'absent.env'), '--output-parent', join(root, 'backups')])
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'Cannot read environment file (ENOENT); check --env-file and file permissions')
    assert.notInclude(await readdir(root), 'invocation.json')
  })
  test('payload includes the script; installer invokes it before migrations with explicit external paths', async ({ assert }) => {
    const config = await readFile('adonisrc.ts', 'utf8')
    assert.include(config, "pattern: 'backup.sh'")
    const installer = await readFile('install.sh0', 'utf8')
    assert.include(installer, 'bash "$SPENDCRAFT_ROOT/$APP_NEW/backup.sh"')
    assert.include(installer, '--env-file "$SPENDCRAFT_ROOT/$APP-env"')
    assert.include(installer, '--output-parent "$SPENDCRAFT_ROOT/backups"')
    assert.isBelow(installer.indexOf('bash "$SPENDCRAFT_ROOT/$APP_NEW/backup.sh"'), installer.indexOf('\nnode ace migration:status'))
    assert.notInclude(installer, '\n./backup.sh\n')
  })
})
