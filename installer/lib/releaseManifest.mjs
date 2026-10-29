// Filesystem-only release identity shared by installation and rollback. No application bootstrap or
// database imports.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, readdir, lstat, realpath, readlink } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute, dirname } from 'node:path'

export const secretLinks = new Set(['.env', '.npmrc', 'PushNotificationKey.p8'])
const requiredFiles = ['bin/server.js', 'ace.js', 'package.json', 'package-lock.json',
  'node_modules',
  'public', 'config/database.js', 'app/Models/Transaction.js', 'commands/QueueListener.js',
    'commands/PlaidCleanupListener.js']
const sha = (value) => createHash('sha256').update(value).digest('hex')
const inside = (parent, child) => child === parent || (!relative(parent, child).startsWith('..') &&
  !isAbsolute(relative(parent, child)))
async function exists(path) {
  try { await lstat(path); return true } catch (error) { if (error.code === 'ENOENT') return false;
    throw error }
}
function manifestError(reason, entry) {
  return Object.assign(new Error(reason), { manifestEntry: entry })
}
async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function releaseManifest(directory) {
  const root = await realpath(directory)
  if (root !== resolve(directory) || !(await lstat(directory)).isDirectory()) throw new Error(
    'release_path_not_real_directory')
  for (const file of requiredFiles) {
    if (!await exists(join(root, file))) throw manifestError('incomplete_release', file)
    const stat = await lstat(join(root, file))
    if (['node_modules', 'public'].includes(file) ? !stat.isDirectory() : !stat.isFile(
      )) throw manifestError('incomplete_release', file)
  }
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (pkg.name !== 'spendcraft' || pkg.type !== 'module' || !pkg.dependencies || typeof pkg
    .dependencies !== 'object') {
    throw new Error('invalid_release_package')
  }
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
  if (lock.name !== pkg.name || ![2, 3].includes(lock.lockfileVersion)) throw new Error(
    'invalid_release_lockfile')
  for (const dependency of Object.keys(pkg.dependencies)) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(dependency)
      || !await exists(join(root, 'node_modules', dependency, 'package.json'))) throw manifestError(
        'missing_runtime_dependency', `node_modules/${dependency}/package.json`)
  }
  const assetRoot = join(root, 'public/assets')
  const assets = JSON.parse(await readFile(join(assetRoot, '.vite/manifest.json'), 'utf8'))
  if (!assets['client-src/App.tsx']?.isEntry) throw new Error('client_entry_missing')
  for (const entry of Object.values(assets)) {
    for (const file of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
      if (typeof file !== 'string' || isAbsolute(file) || !inside(assetRoot, resolve(assetRoot,
        file))
        || !await exists(join(assetRoot, file))) throw manifestError('client_asset_missing',
          typeof file === 'string' ? file : 'public/assets/.vite/manifest.json')
    }
  }
  const files = []
  async function walk(path) {
    for (const entry of (await readdir(path)).sort()) {
      const absolute = join(path, entry)
      const name = relative(root, absolute)
      try {
        const stat = await lstat(absolute)
        const base = { name, mode: stat.mode & 0o777 }
        if (secretLinks.has(name)) {
          if (!stat.isSymbolicLink()) throw manifestError('secret_must_be_external_symlink', name)
          const target = await realpath(absolute)
          if (inside(root, target)) throw manifestError('secret_target_inside_release', name)
          files.push({ ...base, kind: 'secret-link', target })
        } else if (stat.isSymbolicLink()) {
          const target = await readlink(absolute)
          if (!inside(root, resolve(dirname(absolute), target))) throw manifestError(
            'unreviewed_external_release_symlink', name)
          files.push({ ...base, kind: 'link', target })
        } else if (stat.isDirectory()) {
          files.push({ ...base, kind: 'directory' }); await walk(absolute)
        } else if (stat.isFile()) files.push({ ...base, kind: 'file', sha256: await fileHash(
          absolute) })
        else throw manifestError('unsupported_release_file', name)
      } catch (error) {
        error.manifestEntry ??= name
        throw error
      }
    }
  }
  await walk(root)
  if (!files.some((file) => file.name === '.env')) throw new Error('release_env_missing')
  return { format: 1, identity: sha(JSON.stringify(files)), files }
}

