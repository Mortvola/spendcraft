import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, readdir, lstat, open } from 'node:fs/promises'
import { join, relative } from 'node:path'

const hash = (value) => createHash('sha256').update(value).digest('hex')

export async function inventoryFiles(root, sync = false, manifestName = 'bundle.json') {
  const files = []
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name)
      if (path === join(root, manifestName)) continue
      const info = await lstat(path)
      if (info.isDirectory()) await walk(path)
      else if (info.isFile()) {
        const sha = createHash('sha256')
        for await (const chunk of createReadStream(path)) sha.update(chunk)
        files.push({ path: relative(root, path), sha256: sha.digest('hex') })
        if (sync) {
          const file = await open(path, 'r')
          try { await file.sync() } finally { await file.close() }
        }
      } else throw new Error('rollback_bundle_unsupported_file')
    }
    if (sync) {
      const file = await open(directory, 'r')
      try { await file.sync() } finally { await file.close() }
    }
  }
  await walk(root)
  return files
}

export async function verifyRollbackBundle(directory) {
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('rollback_bundle_symlink')
  if (!(await lstat(join(directory, 'bundle.json'))).isFile()) throw new Error('invalid_rollback_bundle_manifest')
  const manifest = JSON.parse(await readFile(join(directory, 'bundle.json'), 'utf8'))
  const files = await inventoryFiles(directory)
  if (manifest.format !== 1 || !['transaction-category-decimal-string-rollback', 'spendcraft-application-rollback'].includes(manifest.purpose)
    || !/^[a-f0-9]{64}$/.test(manifest.releaseId) || manifest.filesSha256 !== hash(JSON.stringify(files))
    || JSON.stringify(manifest.files) !== JSON.stringify(files)) throw new Error('rollback_bundle_integrity_mismatch')
  return manifest
}

export async function verifyRollbackLauncher(directory) {
  if (!(await lstat(directory)).isDirectory()) throw new Error('invalid_rollback_launcher_directory')
  const descriptor = join(directory, 'launcher.json')
  if (!(await lstat(descriptor)).isFile()) throw new Error('invalid_rollback_launcher_manifest')
  const manifest = JSON.parse(await readFile(descriptor, 'utf8'))
  const files = await inventoryFiles(directory, false, 'launcher.json')
  if (manifest.format !== 1 || !/^[a-f0-9]{64}$/.test(manifest.launcherId)
    || manifest.filesSha256 !== hash(JSON.stringify(files)) || JSON.stringify(manifest.files) !== JSON.stringify(files)) {
    throw new Error('rollback_launcher_integrity_mismatch')
  }
  return manifest
}
