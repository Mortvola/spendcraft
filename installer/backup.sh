#!/bin/bash

set -euo pipefail

node --input-type=module -- - "$@" <<'NODE'
import process from 'node:process'
import { parseArgs, parseEnv } from 'node:util'
import { mkdir, mkdtemp, open, readFile, rename, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

// Only application-authored configuration messages are safe to print.
class ConfigurationError extends Error {}

let output
let phase = 'arguments'
try {
  const { values } = parseArgs({ args: process.argv.slice(2), options: {
    'env-file': { type: 'string' }, 'output-parent': { type: 'string' },
  } })
  if (!values['env-file'] || !values['output-parent']) {
    throw new Error('Usage: bash installer/backup.sh --env-file PATH --output-parent DIRECTORY')
  }

  phase = 'output_directory'
  const parent = resolve(values['output-parent'])
  await mkdir(parent, { recursive: true, mode: 0o700 })
  output = await mkdtemp(join(parent, 'database-backup-'))
  console.log(output)

  phase = 'configuration'
  let contents
  try {
    contents = await readFile(resolve(values['env-file']), 'utf8')
  } catch (error) {
    const reason = ['ENOENT', 'EACCES', 'EPERM', 'EISDIR'].includes(error?.code) ? error.code : 'read error'
    throw new ConfigurationError(`Cannot read environment file (${reason}); check --env-file and file permissions`)
  }
  let env
  try { env = parseEnv(contents) }
  catch { throw new ConfigurationError('Cannot parse environment file; check .env syntax') }
  const required = ['PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD', 'PG_DB_NAME']
  const missing = required.filter((key) => !Object.hasOwn(env, key))
  if (missing.length) throw new ConfigurationError(`Missing required environment setting(s): ${missing.join(', ')}`)
  const invalid = []
  if (!/^[a-zA-Z0-9_.:-]+$/.test(env.PG_HOST)) invalid.push('PG_HOST (hostname or IP address required)')
  if (!/^[a-zA-Z0-9_]+$/.test(env.PG_USER)) invalid.push('PG_USER (letters, digits and underscores only)')
  if (!/^[a-zA-Z0-9_]+$/.test(env.PG_DB_NAME)) invalid.push('PG_DB_NAME (letters, digits and underscores only)')
  if (!/^\d+$/.test(env.PG_PORT) || Number(env.PG_PORT) < 1 || Number(env.PG_PORT) > 65535) invalid.push('PG_PORT (integer from 1 to 65535 required)')
  if (invalid.length) throw new ConfigurationError(`Invalid environment setting(s): ${invalid.join(', ')}`)
  const target = { host: env.PG_HOST, port: Number(env.PG_PORT), user: env.PG_USER, database: env.PG_DB_NAME }
  const partial = join(output, 'backup.sql.partial')
  const completed = join(output, 'backup.sql')
  const startedAt = new Date().toISOString()
  phase = 'pg_dump'
  const diagnostics = await open(join(output, 'pg_dump.stderr.log'), 'wx', 0o600)
  const file = await open(partial, 'wx', 0o600)
  try {
    await new Promise((resolveDump, rejectDump) => {
      const child = spawn('pg_dump', ['--format=plain', '--no-password',
        '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', target.database], {
        stdio: ['ignore', file.fd, diagnostics.fd],
        // Do not inherit PGDATABASE/PGSERVICE/PGOPTIONS or shell target overrides.
        env: { PATH: process.env.PATH, PGPASSWORD: env.PG_PASSWORD, PGAPPNAME: 'spendcraft-install-backup' },
      })
      let interrupted = false
      const interrupt = () => { interrupted = true; child.kill('SIGTERM') }
      process.once('SIGINT', interrupt)
      process.once('SIGTERM', interrupt)
      // Keep diagnostics in the private output folder, not installer console logs.
      child.once('error', () => {
        process.removeListener('SIGINT', interrupt)
        process.removeListener('SIGTERM', interrupt)
        rejectDump(new Error('Unable to start pg_dump'))
      })
      child.once('close', (code, signal) => {
        process.removeListener('SIGINT', interrupt)
        process.removeListener('SIGTERM', interrupt)
        if (interrupted || code !== 0 || signal) rejectDump(new Error('pg_dump failed or was interrupted; partial output retained'))
        else resolveDump()
      })
    })
    if ((await file.stat()).size === 0) throw new Error('pg_dump produced an empty backup')
    await file.sync()
  } finally {
    await file.close()
    await diagnostics.close()
  }

  phase = 'publish'
  await rename(partial, completed)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(completed)) hash.update(chunk)
  const summary = await open(join(output, 'summary.json'), 'wx', 0o600)
  try {
    await summary.writeFile(JSON.stringify({ status: 'complete', target, startedAt,
      completedAt: new Date().toISOString(), file: 'backup.sql', bytes: (await stat(completed)).size,
      sha256: hash.digest('hex'), format: 'plain' }, null, 2) + '\n')
    await summary.sync()
  } finally { await summary.close() }
  const directory = await open(output, 'r')
  try { await directory.sync() } finally { await directory.close() }
  console.log('Backup completed successfully.')
} catch (error) {
  // A partial file or a directory without a complete summary is never a successful backup.
  const message = error instanceof ConfigurationError || (error instanceof Error && ['arguments', 'pg_dump'].includes(phase))
    ? error.message : 'operation failed'
  console.error(`Backup failed during ${phase}: ${message}`)
  if (output) console.error(`Incomplete output retained at: ${output}`)
  process.exitCode = 1
}
NODE
