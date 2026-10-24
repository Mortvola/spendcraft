// Filesystem-only packaging. Does not instantiate a database client or run rollback.
import { createRequire } from 'node:module'
import process from 'node:process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, lstat, realpath, open, rename, rm } from 'node:fs/promises'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'

import { inventoryFiles, verifyRollbackBundle, verifyRollbackLauncher } from './lib/rollbackBundleIntegrity.mjs'
export { verifyRollbackBundle } from './lib/rollbackBundleIntegrity.mjs'

const execute = promisify(execFile)
const tools = ['tax-storage-profile.json', 'lib/taxReleaseRecovery.mjs', 'lib/pm2Processes.mjs', 'pm2-processes.json', 'prepareRollbackBundle.mjs', 'rollbackApplication.mjs', 'lib/applicationRollback.mjs', 'lib/releaseManifest.mjs', 'lib/rollbackBundleIntegrity.mjs']
const hash = (value) => createHash('sha256').update(value).digest('hex')
const inside = (parent, child) => child === parent || (!relative(parent, child).startsWith('..') && !isAbsolute(relative(parent, child)))

async function writeJson(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync() } finally { await file.close() }
}

async function packageAt(name, from) {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error('invalid_bundle_dependency')
  const require = createRequire(join(from, 'package.json'))
  let path
  try { path = require.resolve(`${name}/package.json`) }
  catch { path = require.resolve(name) }
  for (let directory = dirname(path); directory !== dirname(directory); directory = dirname(directory)) {
    let pkg
    try { pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (pkg.name === name) return { directory: await realpath(directory), pkg }
  }
  throw new Error('bundle_dependency_package_missing')
}

async function copyDependency(name, from, destination, ancestors = new Set(), boundary = from) {
  const { directory, pkg } = await packageAt(name, from)
  if (!inside(boundary, directory)) throw new Error('bundle_dependency_outside_release')
  if (ancestors.has(directory)) return // Node resolves the already-copied ancestor.
  const path = join(destination, 'node_modules', name)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await cp(directory, path, { recursive: true, errorOnExist: true, force: false,
    filter: (entry) => entry !== join(directory, 'node_modules') })
  const lineage = new Set([...ancestors, directory])
  const required = { ...pkg.dependencies }
  for (const [peer, version] of Object.entries(pkg.peerDependencies || {})) {
    if (!pkg.peerDependenciesMeta?.[peer]?.optional) required[peer] = version
  }
  const optional = pkg.optionalDependencies || {}
  for (const dependency of Object.keys({ ...required, ...optional }).sort()) {
    if (Object.hasOwn(optional, dependency)) {
      try { await packageAt(dependency, directory) }
      catch (error) { if (error.code === 'MODULE_NOT_FOUND') continue; throw error }
    }
    await copyDependency(dependency, directory, path, lineage, boundary)
  }
  return pkg.version
}

export async function prepareRollbackBundle({ root, release, releaseId, source }, print = () => undefined) {
  if (!/^[a-f0-9]{64}$/.test(releaseId)) throw new Error('invalid_rollback_bundle_release_id')
  root = resolve(root)
  release = await realpath(release)
  if (await realpath(root) !== root) throw new Error('rollback_bundle_root_not_canonical')
  if (inside(release, root)) throw new Error('rollback_bundle_root_inside_release')
  let parent = root
  for (const name of ['maintenance', 'rollback']) {
    parent = join(parent, name)
    try { await mkdir(parent, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
    if (!(await lstat(parent)).isDirectory() || await realpath(parent) !== parent) throw new Error('unsafe_rollback_bundle_directory')
  }
  const staging = await mkdtemp(join(parent, `.prepare-${releaseId.slice(0, 12)}-`))
  print(`Preparing rollback bundle: ${staging}`)
  // Failed preparation remains private evidence; it is never a published bundle.
  for (const tool of tools) {
    const from = join(release, 'installer', tool)
    if (!(await lstat(from)).isFile()) throw new Error('rollback_tool_missing_or_linked')
    await mkdir(dirname(join(staging, tool)), { recursive: true, mode: 0o700 })
    await cp(from, join(staging, tool), { errorOnExist: true, force: false })
  }
  const pgVersion = await copyDependency('pg', release, staging)
  await writeJson(join(staging, 'package.json'), { name: 'spendcraft-release-rollback', private: true,
    type: 'module', dependencies: { pg: pgVersion } })
  // Probe the isolated dependency copy without constructing a Client or making
  // any network/database connection. No ambient loader or NODE_PATH is used.
  await execute(process.execPath, ['--input-type=module', '-e',
    "const { Client } = await import('pg'); if (typeof Client !== 'function') throw new Error('Invalid pg client')"],
  { cwd: staging, env: { PATH: process.env.PATH }, timeout: 30000 })
  const instructions = `# Release-specific rollback bundle\n\nRelease identity: ${releaseId}\n\nThis bundle restores only a compatible application release; it does not convert database values.\nDo not run npm install here or edit these files. It contains pg and its runtime\ndependencies and does not depend on either swapped application directory.\n\nFrom this directory, verify integrity without database access:\n\n    node --input-type=module -e 'import {verifyRollbackBundle} from "./prepareRollbackBundle.mjs"; await verifyRollbackBundle("."); console.log("Bundle verified")'\n\nStart with help (no database access):\n\n    node rollbackApplication.mjs --help\n\nPreferred entry point (automatically selects the installed release bundle):\n\n    "$SPENDCRAFT_ROOT/maintenance/rollback.sh" --dry-run\n    "$SPENDCRAFT_ROOT/maintenance/rollback.sh" --execute\n\nThe installer generates maintenance/rollback-plan.json after startup. Separate\nenvironment-specific authorization is required; neither mode is run by the installer.\nStore plans and private outputs outside this immutable bundle. Run from the\nmaintenance/rollback directory or another stable maintenance directory.\nExisting backup, writer shutdown, database identity, manifest review and explicit\nconfirmation requirements are unchanged. Historical conversion recovery is a separate operation.\n\nAn unrecognized tax-storage predecessor is rejected. There is no automatic\nselection of another release and no preserved-copy recovery mode. If the previous\nrelease is incompatible, keep the compatible current release and deploy a tested\ncompatible correction. Database/schema differences\nrequire separate review; no data migration is reversed by this tool.\n`
  const readme = await open(join(staging, 'README.md'), 'wx', 0o600)
  try { await readme.writeFile(instructions) } finally { await readme.close() }
  const files = await inventoryFiles(staging, true)
  const manifest = { format: 1, purpose: 'spendcraft-application-rollback', releaseId,
    source, pgVersion, files, filesSha256: hash(JSON.stringify(files)) }
  await writeJson(join(staging, 'bundle.json'), manifest)
  const prepared = await verifyRollbackBundle(staging)
  const destination = join(parent, releaseId)
  let existing = false
  try { await lstat(destination); existing = true } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (existing) {
    const original = await verifyRollbackBundle(destination)
    if (original.releaseId !== releaseId || original.filesSha256 !== prepared.filesSha256
      || JSON.stringify(original.source) !== JSON.stringify(source)) throw new Error('existing_rollback_bundle_conflict')
    await rm(staging, { recursive: true })
  } else await rename(staging, destination)
  for (const path of [destination, parent]) {
    const directory = await open(path, 'r')
    try { await directory.sync() } finally { await directory.close() }
  }
  print(`Rollback bundle ready: ${destination}`)
  await installRollbackLauncher({ root, release, parent }, print)
  return { directory: destination, manifest: prepared }
}

async function installRollbackLauncher({ root, release, parent }, print) {
  const sourceFiles = ['launchRollback.mjs', 'lib/releaseManifest.mjs', 'lib/rollbackBundleIntegrity.mjs']
  const template = await readFile(join(release, 'installer/rollback.sh'), 'utf8')
  if (!template.includes('\nLAUNCHER_ID=unconfigured\n')) throw new Error('invalid_rollback_shell_template')
  const inputs = [['rollback.sh', hash(template)]]
  for (const file of sourceFiles) inputs.push([file, hash(await readFile(join(release, 'installer', file)))])
  const launcherId = hash(JSON.stringify(inputs))
  const wrapper = template.replace('\nLAUNCHER_ID=unconfigured\n', `\nLAUNCHER_ID=${launcherId}\n`)
  const destination = join(parent, `launcher-${launcherId}`)
  let exists = false
  try { await lstat(destination); exists = true } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!exists) {
    const staging = await mkdtemp(join(parent, '.launcher-prepare-'))
    for (const file of sourceFiles) {
      await mkdir(dirname(join(staging, file)), { recursive: true, mode: 0o700 })
      await cp(join(release, 'installer', file), join(staging, file), { force: false, errorOnExist: true })
    }
    const shell = await open(join(staging, 'rollback.sh'), 'wx', 0o700)
    try { await shell.writeFile(wrapper); await shell.sync() } finally { await shell.close() }
    const files = await inventoryFiles(staging, true, 'launcher.json')
    await writeJson(join(staging, 'launcher.json'), { format: 1, launcherId, files, filesSha256: hash(JSON.stringify(files)) })
    await rename(staging, destination)
  }
  const verified = await verifyRollbackLauncher(destination)
  if (verified.launcherId !== launcherId || await readFile(join(destination, 'rollback.sh'), 'utf8') !== wrapper) throw new Error('rollback_launcher_identity_mismatch')
  const shellPath = join(root, 'maintenance/rollback.sh')
  let previous
  try {
    if (!(await lstat(shellPath)).isFile()) throw new Error('unmanaged_rollback_shell')
    previous = await readFile(shellPath, 'utf8')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (previous !== undefined && previous !== wrapper) {
    const id = /^LAUNCHER_ID=([a-f0-9]{64})$/m.exec(previous)?.[1]
    if (!id) throw new Error('unmanaged_rollback_shell')
    const old = join(parent, `launcher-${id}`)
    await verifyRollbackLauncher(old)
    if (await readFile(join(old, 'rollback.sh'), 'utf8') !== previous) throw new Error('unmanaged_rollback_shell')
  }
  if (previous !== wrapper) {
    const temporary = await mkdtemp(join(root, 'maintenance/.rollback-shell-'))
    const path = join(temporary, 'rollback.sh')
    const shell = await open(path, 'wx', 0o700)
    try { await shell.writeFile(wrapper); await shell.sync() } finally { await shell.close() }
    let current
    try { current = await readFile(shellPath, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (current !== previous) throw new Error('rollback_shell_changed_during_installation')
    await rename(path, shellPath)
    await rm(temporary, { recursive: true })
  }
  for (const path of [destination, parent, join(root, 'maintenance')]) {
    const directory = await open(path, 'r')
    try { await directory.sync() } finally { await directory.close() }
  }
  print(`Rollback launcher ready: ${shellPath}`)
}
