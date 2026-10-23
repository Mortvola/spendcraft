// Stable, filesystem-only selection. Only the verified child may access a DB.
import process from 'node:process'
import console from 'node:console'
import { readFile, lstat, realpath } from 'node:fs/promises'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { releaseManifest } from './lib/releaseManifest.mjs'
import { verifyRollbackBundle, verifyRollbackLauncher } from './lib/rollbackBundleIntegrity.mjs'

export async function selectRollback(root) {
  root = resolve(root)
  if (await realpath(root) !== root) throw new Error('rollback_root_not_canonical')
  const maintenance = join(root, 'maintenance')
  const bundles = join(maintenance, 'rollback')
  for (const directory of [maintenance, bundles]) {
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw new Error('unsafe_rollback_bundle_directory')
  }
  const current = await releaseManifest(join(root, 'spendcraft'))
  const bundle = join(bundles, current.identity)
  let manifest
  try { manifest = await verifyRollbackBundle(bundle) }
  catch (error) { if (error.code === 'ENOENT') throw new Error('matching_rollback_bundle_missing'); throw error }
  if (manifest.releaseId !== current.identity) throw new Error('rollback_bundle_release_mismatch')
  const planPath = join(maintenance, 'rollback-plan.json')
  let plan
  try { plan = JSON.parse(await readFile(planPath, 'utf8')) }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('rollback_plan_missing')
    if (error instanceof SyntaxError) throw new Error('invalid_rollback_plan_json')
    throw error
  }
  if (plan.unavailableReason) throw new Error('rollback_unavailable_for_installed_release')
  if (plan.root !== root || typeof plan.currentManifest !== 'string' || !isAbsolute(plan.currentManifest)) throw new Error('rollback_plan_target_mismatch')
  const expected = JSON.parse(await readFile(plan.currentManifest, 'utf8'))
  const hash = createHash('sha256').update(JSON.stringify(expected.files)).digest('hex')
  if (expected.format !== 1 || hash !== expected.identity || expected.identity !== current.identity) throw new Error('rollback_plan_release_mismatch')
  return { bundle, planPath, maintenance, executor: join(bundle, 'rollbackTransactionCategoryStorage.mjs') }
}

async function executeChild({ executor, planPath, maintenance }, mode) {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  delete env.NODE_PG_FORCE_NATIVE
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [executor, '--plan', planPath, mode], { cwd: maintenance, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => resolveExit(code ?? 1))
  })
}

export async function launchRollback(root, mode, execute = executeChild) {
  if (!['--dry-run', '--execute'].includes(mode)) throw new Error('rollback_mode_required')
  const selected = await selectRollback(root)
  console.log(`Selected rollback bundle: ${selected.bundle}`)
  return execute(selected, mode)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ownDirectory = dirname(fileURLToPath(import.meta.url))
    const own = await verifyRollbackLauncher(ownDirectory)
    if (ownDirectory !== join(dirname(ownDirectory), `launcher-${own.launcherId}`)) throw new Error('rollback_launcher_identity_mismatch')
    const { values } = parseArgs({ options: { root: { type: 'string' }, 'dry-run': { type: 'boolean' }, execute: { type: 'boolean' } }, strict: true })
    if (!values.root || Boolean(values['dry-run']) === Boolean(values.execute)) throw new Error('rollback_mode_required')
    process.exitCode = await launchRollback(values.root, values.execute ? '--execute' : '--dry-run')
  } catch (error) {
    const reason = /^[a-z_]+$/.test(error.message) ? error.message : /^[A-Z_]+$/.test(error.code || '') ? error.code : 'rollback_launcher_failed'
    console.error(`Rollback not started: ${reason}. Check the exact installed release bundle and maintenance/rollback-plan.json. No automatic fallback was attempted.`)
    process.exitCode = 1
  }
}
