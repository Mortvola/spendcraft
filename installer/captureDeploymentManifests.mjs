// Installer/build tooling only: no database or application imports.
import process from 'node:process'
import console from 'node:console'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { lstat, realpath, readFile, open, mkdir, mkdtemp } from 'node:fs/promises'
import { releaseManifest } from './lib/releaseManifest.mjs'
import { prepareRollbackBundle } from './prepareRollbackBundle.mjs'

async function writeExclusive(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync() } finally {
    await file.close() }
}

async function sourceMetadata(directory, required) {
  try {
    const metadata = JSON.parse(await readFile(join(directory, 'release-source.json'), 'utf8'))
    if (metadata.format !== 1 || !/^[a-f0-9]{40}$/.test(metadata.commit) || typeof metadata
      .dirty !== 'boolean'
      || typeof metadata.builtAt !== 'string' || !Number.isFinite(Date.parse(metadata
        .builtAt))) throw new Error('invalid_release_source')
    return metadata
  } catch (error) {
    if (!required && error.code === 'ENOENT') return null
    throw error
  }
}

async function captureStep(phase, path, operation) {
  try { return await operation() }
  catch (error) {
    error.captureContext ??= { phase, path }
    throw error
  }
}

export async function recordDeployment(root, print = (path) => console.log(path)) {
  const canonical = await captureStep('validate-root', root, async () => {
    const path = await realpath(root)
    if (path !== resolve(root) || !(await lstat(root)).isDirectory()) throw new Error(
      'invalid_deployment_root')
    return path
  })
  const records = join(canonical, 'releases')
  await captureStep('prepare-records-directory', records, async () => {
    await mkdir(records, { recursive: true, mode: 0o700 })
    if ((await lstat(records)).isSymbolicLink() || await realpath(
      records) !== records) throw new Error('invalid_release_records_directory')
  })
  const output = await captureStep('create-record-directory', records,
    () => mkdtemp(join(records, `deployment-${new Date().toISOString().replaceAll(':', '-')}-`)))
  print(output)
  const current = join(canonical, 'spendcraft.new')
  const previous = join(canonical, 'spendcraft')
  const currentSource = await captureStep('read-current-build-identity', join(current,
    'release-source.json'), () => sourceMetadata(current, true))
  const previousExists = await captureStep('inspect-previous-release', previous, async () => {
    try { await lstat(previous); return true } catch (error) { if (error.code ===
      'ENOENT') return false; throw error }
  })
  let previousManifest = null
  let previousSource = null
  if (previousExists) {
    previousManifest = await captureStep('capture-previous-release', previous, () =>
      releaseManifest(previous))
    previousSource = await captureStep('read-previous-build-identity', join(previous,
      'release-source.json'), () => sourceMetadata(previous, false))
    const path = join(output, 'previous-release-manifest.json')
    await captureStep('write-previous-manifest', path, () => writeExclusive(path, previousManifest))
  }
  const currentManifest = await captureStep('capture-current-release', current, () =>
    releaseManifest(current))
  const manifestPath = join(output, 'current-release-manifest.json')
  await captureStep('write-current-manifest', manifestPath, () => writeExclusive(manifestPath,
    currentManifest))
  const record = { format: 1, status: 'captured-before-swap', capturedAt: new Date().toISOString(),
    previous: previousManifest ? { identity: previousManifest.identity, source: previousSource,
      manifest: 'previous-release-manifest.json', installedPathAfterSwap: join(canonical,
        'spendcraft.old') } : null,
    current: { identity: currentManifest.identity, source: currentSource, manifest:
      'current-release-manifest.json',
      installedPathAfterSwap: join(canonical, 'spendcraft') } }
  const recordPath = join(output, 'deployment.json')
  await captureStep('write-deployment-record', recordPath, () => writeExclusive(recordPath, record))
  for (const path of [output, records, canonical]) {
    await captureStep('sync-record-directory', path, async () => {
      const directory = await open(path, 'r')
      try { await directory.sync() } finally { await directory.close() }
    })
  }
  return { output, record }
}

export async function writeBuildSource(path, git = (args) => execFileSync('git', args, { encoding:
  'utf8' }).trim()) {
  const commit = git(['rev-parse', 'HEAD'])
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('invalid_build_commit')
  // Dirty includes staged, unstaged and untracked paths. Never claim HEAD alone identifies a dirty
  // package.
  const dirty = Boolean(git(['status', '--porcelain', '--untracked-files=normal']))
  await writeExclusive(path, { format: 1, commit, dirty, builtAt: new Date().toISOString() })
}

async function inspectDeployment(root) {
  const canonical = await captureStep('validate-root', root, async () => {
    const path = await realpath(root)
    if (path !== resolve(root) || !(await lstat(root)).isDirectory()) throw new Error(
      'invalid_deployment_root')
    return path
  })
  const current = join(canonical, 'spendcraft.new')
  await captureStep('read-current-build-identity', join(current, 'release-source.json'), () =>
    sourceMetadata(current, true))
  for (const [phase, path] of [['capture-previous-release', join(canonical, 'spendcraft')], [
    'capture-current-release', current]]) {
    if (phase === 'capture-previous-release') {
      const exists = await captureStep('inspect-previous-release', path, async () => {
        try { await lstat(path); return true } catch (error) { if (error.code ===
          'ENOENT') return false; throw error }
      })
      if (!exists) continue
    }
    await captureStep(phase, path, () => releaseManifest(path))
    if (phase === 'capture-previous-release') await captureStep('read-previous-build-identity',
      join(path, 'release-source.json'), () => sourceMetadata(path, false))
  }
  console.log(
    'Release inspection passed. No deployment records, release directories or processes were \
changed.')
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: {
    root: { type: 'string' }, 'write-build-source': { type: 'string' }, 'inspect-root': { type:
      'string' }, 'prepare-rollback-bundle': { type: 'boolean' },
  } })
  if ([values.root, values['write-build-source'], values['inspect-root']].filter(Boolean)
    .length !== 1) throw new Error('choose_one_capture_mode')
  if (values['prepare-rollback-bundle'] && !values.root) throw new Error(
    'bundle_requires_deployment_capture')
  if (values['inspect-root']) await inspectDeployment(resolve(values['inspect-root']))
  else if (values.root) {
    const { record } = await recordDeployment(resolve(values.root))
    if (values['prepare-rollback-bundle']) await captureStep('prepare-rollback-bundle', resolve(
      values.root),
      () => prepareRollbackBundle({ root: resolve(values.root), release: join(resolve(values.root),
        'spendcraft.new'),
        releaseId: record.current.identity, source: record.current.source }, (message) => console
          .log(message)))
  }
  else await writeBuildSource(resolve(values['write-build-source']))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Never print raw parser errors, file contents, credentials or child stderr.
    const knownReasons = new Set(['invalid_deployment_root', 'invalid_release_records_directory',
      'invalid_release_source', 'release_path_not_real_directory', 'incomplete_release',
      'invalid_release_package', 'invalid_release_lockfile', 'missing_runtime_dependency',
      'client_entry_missing', 'client_asset_missing', 'secret_must_be_external_symlink',
      'secret_target_inside_release', 'unreviewed_external_release_symlink',
      'unsupported_release_file', 'release_env_missing', 'invalid_build_commit',
        'choose_one_capture_mode',
      'bundle_requires_deployment_capture', 'rollback_bundle_unsupported_file',
        'invalid_bundle_dependency',
      'bundle_dependency_package_missing', 'bundle_dependency_outside_release',
        'rollback_bundle_symlink', 'invalid_rollback_bundle_manifest',
      'rollback_bundle_integrity_mismatch', 'invalid_rollback_bundle_release_id',
      'rollback_bundle_root_not_canonical', 'rollback_bundle_root_inside_release',
      'unsafe_rollback_bundle_directory', 'rollback_tool_missing_or_linked',
        'existing_rollback_bundle_conflict',
      'invalid_rollback_shell_template', 'rollback_launcher_identity_mismatch',
        'unmanaged_rollback_shell',
      'rollback_shell_changed_during_installation', 'rollback_launcher_integrity_mismatch',
      'invalid_rollback_launcher_directory', 'invalid_rollback_launcher_manifest'])
    const code = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
      ? error.code : knownReasons.has(error.message) ? error.message
        : error instanceof SyntaxError ? 'invalid_json' : 'unclassified_error'
    console.error(`Diagnostic: ${JSON.stringify({ ...error.captureContext, code, entry: error
      .manifestEntry })}`)
    console.error(
      'Release manifest capture failed. Do not swap releases or resume processes; inspect the \
partial deployment record.')
    process.exitCode = 1
  })
}
