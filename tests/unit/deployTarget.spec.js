import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

async function runDeploy(args, variables = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'spendcraft-deploy-target-'))
  try {
    await writeFile(join(directory, 'build.sh'), '#!/bin/bash\nprintf "BUILD\\n"\n', { mode: 0o700 })
    await mkdir(join(directory, 'installer'))
    await writeFile(join(directory, 'installer/install.sh0'), await readFile('installer/install.sh0', 'utf8'))
    return spawnSync('bash', ['-c', `
rm() { :; }
zip() { :; }
cp() { :; }
base64() { :; }
chmod() { :; }
scp() { sed -n 's/^INSTALL_TARGET=/PACKAGED_TARGET:/p' install.sh; printf 'UPLOAD_ARG:%s\\n' "$@"; }

source "$1" "\${@:2}"
`, 'deploy-test', resolve('deploy.sh'), ...args], {
      cwd: directory,
      env: { PATH: process.env.PATH, ...variables },
      encoding: 'utf8',
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const configuration = {
  SPENDCRAFT_SERVER: 'production.example', SPENDCRAFT_SSH_KEY: '/keys/production key.pem',
  SPENDCRAFT_STAGING_SERVER: 'staging.example', SPENDCRAFT_STAGING_SSH_KEY: '/keys/staging key.pem',
}

test.group('Deploy target selection (inert build and upload)', () => {
  test('uses the selected server and preserves the key path as one argument')
    .with(['production', 'staging']).run(async ({ assert }, target) => {
      const result = await runDeploy([target], configuration)
      assert.equal(result.status, 0)
      assert.equal(result.stdout, `BUILD\nPACKAGED_TARGET:${target}\nUPLOAD_ARG:-i\nUPLOAD_ARG:/keys/${target} key.pem\nUPLOAD_ARG:install.sh\nUPLOAD_ARG:ubuntu@${target}.example:\n`)
    })
  test('rejects missing, invalid or extra target arguments before building')
    .with([[], ['test'], ['production', 'staging']]).run(async ({ assert }, args) => {
      const result = await runDeploy(args, configuration)
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.include(result.stderr, 'production|staging')
    })
  test('rejects missing or empty selected configuration before building')
    .with(Object.keys(configuration)).run(async ({ assert }, variable) => {
      const variables = { ...configuration, [variable]: '' }
      const target = variable.includes('STAGING') ? 'staging' : 'production'
      const result = await runDeploy([target], variables)
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.include(result.stderr, variable)
    })
  test('does not require configuration for the other environment')
    .with(['production', 'staging']).run(async ({ assert }, target) => {
      const variables = Object.fromEntries(Object.entries(configuration).filter(([key]) => key.includes('STAGING') === (target === 'staging')))
      const result = await runDeploy([target], variables)
      assert.equal(result.status, 0)
    })
  test('an installer rejects a conflicting packaged target before installation', async ({ assert }) => {
    const source = await readFile('installer/install.sh0', 'utf8')
    const header = source.slice(0, source.indexOf('\nconfirm_deployment() {'))
      .replace('INSTALL_TARGET=unconfigured', 'INSTALL_TARGET=staging')
    const result = spawnSync('bash', ['-c', header, 'install.sh', 'production'], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'does not match its packaged deployment target')
  })
})
