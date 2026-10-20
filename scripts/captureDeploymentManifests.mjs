// Installer/build tooling only: no database or application imports.
import process from 'node:process'
import console from 'node:console'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { lstat, realpath, readFile, open, mkdir, mkdtemp } from 'node:fs/promises'
import { releaseManifest } from './lib/releaseManifest.mjs'

async function writeExclusive(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync() } finally { await file.close() }
}

async function sourceMetadata(directory, required) {
  try {
    const metadata = JSON.parse(await readFile(join(directory, 'release-source.json'), 'utf8'))
    if (metadata.format !== 1 || !/^[a-f0-9]{40}$/.test(metadata.commit) || typeof metadata.dirty !== 'boolean'
      || typeof metadata.builtAt !== 'string' || !Number.isFinite(Date.parse(metadata.builtAt))) throw new Error('invalid_release_source')
    return metadata
  } catch (error) {
    if (!required && error.code === 'ENOENT') return null
    throw error
  }
}

export async function recordDeployment(root, print = (path) => console.log(path)) {
  const canonical = await realpath(root)
  if (canonical !== resolve(root) || !(await lstat(root)).isDirectory()) throw new Error('invalid_deployment_root')
  const records = join(canonical, 'releases')
  await mkdir(records, { recursive: true, mode: 0o700 })
  if ((await lstat(records)).isSymbolicLink() || await realpath(records) !== records) throw new Error('invalid_release_records_directory')
  const output = await mkdtemp(join(records, `deployment-${new Date().toISOString().replaceAll(':', '-')}-`))
  print(output)
  const current = join(canonical, 'spendcraft.new')
  const previous = join(canonical, 'spendcraft')
  const currentSource = await sourceMetadata(current, true)
  let previousExists = true
  try { await lstat(previous) } catch (error) { if (error.code === 'ENOENT') previousExists = false; else throw error }
  let previousManifest = null
  let previousSource = null
  if (previousExists) {
    previousManifest = await releaseManifest(previous)
    previousSource = await sourceMetadata(previous, false)
    await writeExclusive(join(output, 'previous-release-manifest.json'), previousManifest)
  }
  const currentManifest = await releaseManifest(current)
  await writeExclusive(join(output, 'current-release-manifest.json'), currentManifest)
  const record = { format: 1, status: 'captured-before-swap', capturedAt: new Date().toISOString(),
    previous: previousManifest ? { identity: previousManifest.identity, source: previousSource,
      manifest: 'previous-release-manifest.json', installedPathAfterSwap: join(canonical, 'spendcraft.old') } : null,
    current: { identity: currentManifest.identity, source: currentSource, manifest: 'current-release-manifest.json',
      installedPathAfterSwap: join(canonical, 'spendcraft') } }
  await writeExclusive(join(output, 'deployment.json'), record)
  for (const path of [output, records, canonical]) {
    const directory = await open(path, 'r')
    try { await directory.sync() } finally { await directory.close() }
  }
  return { output, record }
}

export async function writeBuildSource(path, git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim()) {
  const commit = git(['rev-parse', 'HEAD'])
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('invalid_build_commit')
  // Dirty includes staged, unstaged and untracked paths. Never claim HEAD alone identifies a dirty package.
  const dirty = Boolean(git(['status', '--porcelain', '--untracked-files=normal']))
  await writeExclusive(path, { format: 1, commit, dirty, builtAt: new Date().toISOString() })
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: {
    root: { type: 'string' }, 'write-build-source': { type: 'string' },
  } })
  if (Boolean(values.root) === Boolean(values['write-build-source'])) throw new Error('choose_one_capture_mode')
  if (values.root) await recordDeployment(resolve(values.root))
  else await writeBuildSource(resolve(values['write-build-source']))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Release manifest capture failed. Do not swap releases or resume processes; inspect the partial deployment record.')
    process.exitCode = 1
  })
}
