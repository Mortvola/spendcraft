import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

async function runSeeding(seedStatus = 0) {
  const source = await readFile('installer/install.sh0', 'utf8')
  const start = source.indexOf('seed_database() {')
  const end = source.indexOf('\nconfirm_deployment DEPLOY', start)
  if (start < 0 || end < 0) throw new Error('Missing installer seeding function')
  // Execute only the actual seeding function with an inert node substitute.
  // No installer setup, filesystem operations, PM2 or database client runs.
  return spawnSync('bash', ['-c', `set -e
set -o pipefail
node() { printf 'STUB_NODE:%s\\n' "$*"; return ${seedStatus}; }
${source.slice(start, end)}
seed_database
printf 'CONTINUED\\n'
`], { input: '', encoding: 'utf8' })
}

test.group('Installer automatic seeding (no database)', () => {
  test('runs the seeder once without operator input', async ({ assert }) => {
    const result = await runSeeding()
    assert.equal(result.status, 0)
    assert.equal((result.stdout.match(/STUB_NODE:ace db:seed/g) ?? []).length, 1)
    assert.notInclude(result.stdout, 'type SEED')
    assert.include(result.stdout, 'CONTINUED')
  })
  test('seeder failure stops installation', async ({ assert }) => {
    const result = await runSeeding(7)
    assert.equal(result.status, 7)
    assert.notInclude(result.stdout, 'CONTINUED')
  })
  test('seeding occurs after migration command and before release switch/restarts', async ({ assert }) => {
    const source = await readFile('installer/install.sh0', 'utf8')
    const call = source.indexOf('\nseed_database\n')
    assert.isAbove(call, source.indexOf('\nnode ace migration:run\n'))
    assert.isBelow(call, source.indexOf('mv $APP_NEW $APP'))
    assert.isBelow(call, source.indexOf('--action start'))
    assert.notInclude(source, 'all pending migrations plus db:seed are approved')
  })
})
