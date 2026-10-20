import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

async function runDecision(input, seedStatus = 0) {
  const source = await readFile('install.sh0', 'utf8')
  const start = source.indexOf('seed_database() {')
  const end = source.indexOf('\nconfirm_deployment DEPLOY', start)
  if (start < 0 || end < 0) throw new Error('Missing installer seeding function')
  // Execute only the actual prompt function with an inert node substitute.
  // No installer setup, filesystem operations, PM2 or database client runs.
  return spawnSync('bash', ['-c', `set -e
set -o pipefail
node() { printf 'STUB_NODE:%s\\n' "$*"; return ${seedStatus}; }
${source.slice(start, end)}
seed_database
printf 'CONTINUED\\n'
`], { input, encoding: 'utf8' })
}

test.group('Installer operator seeding decision (no database)', () => {
  test('explicit seed runs the seeder once').with(['SEED', 'seed']).run(async ({ assert }, choice) => {
    const result = await runDecision(`${choice}\n`)
    assert.equal(result.status, 0)
    assert.equal((result.stdout.match(/STUB_NODE:ace db:seed/g) ?? []).length, 1)
    assert.include(result.stdout, 'CONTINUED')
  })
  test('skip continues without invoking the seeder').with(['SKIP', 'skip']).run(async ({ assert }, choice) => {
    const result = await runDecision(`${choice}\n`)
    assert.equal(result.status, 0)
    assert.notInclude(result.stdout, 'STUB_NODE:')
    assert.include(result.stdout, 'Skipping database seeding.')
    assert.include(result.stdout, 'CONTINUED')
  })
  test('abort stops installation').with(['ABORT', 'abort']).run(async ({ assert }, choice) => {
    const result = await runDecision(`${choice}\n`)
    assert.equal(result.status, 1)
    assert.notInclude(result.stdout, 'STUB_NODE:')
    assert.notInclude(result.stdout, 'CONTINUED')
    assert.include(result.stderr, 'services remain stopped')
  })
  test('EOF aborts without running seeders', async ({ assert }) => {
    const result = await runDecision('')
    assert.equal(result.status, 1)
    assert.notInclude(result.stdout, 'STUB_NODE:')
    assert.notInclude(result.stdout, 'CONTINUED')
  })
  test('invalid or blank input reprompts without seeding', async ({ assert }) => {
    const result = await runDecision('\nyes\nSKIP\n')
    assert.equal(result.status, 0)
    assert.equal((result.stderr.match(/Enter SEED, SKIP, or ABORT/g) ?? []).length, 2)
    assert.notInclude(result.stdout, 'STUB_NODE:')
    assert.include(result.stdout, 'CONTINUED')
  })
  test('seeder failure stops installation', async ({ assert }) => {
    const result = await runDecision('SEED\n', 7)
    assert.equal(result.status, 7)
    assert.notInclude(result.stdout, 'CONTINUED')
  })
  test('decision occurs after migration command and before release switch/restarts', async ({ assert }) => {
    const source = await readFile('install.sh0', 'utf8')
    const call = source.indexOf('\nseed_database\n')
    assert.isAbove(call, source.indexOf('\nnode ace migration:run\n'))
    assert.isBelow(call, source.indexOf('mv $APP_NEW $APP'))
    assert.isBelow(call, source.indexOf('pm2 restart queue'))
    assert.notInclude(source, 'all pending migrations plus db:seed are approved')
  })
})
