// Filesystem-only recognition of the reviewed tax/Category storage boundary.
// No application bootstrap, database driver, PM2, or financial mutation.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { URL } from 'node:url'

const profile = JSON.parse(await readFile(new URL('../tax-storage-profile.json', import.meta.url), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
export function taxStorageCompatibility(manifest) {
  if (manifest?.format !== 1 || !Array.isArray(manifest.files)
    || manifest.identity !== hash(JSON.stringify(manifest.files))) return 'unknown'
  const files = new Map(manifest.files.map(file => [file.name, file]))
  // File presence, source commit labels and self-declared capabilities are not evidence.
  return Object.entries(profile.files).every(([name, digest]) => files.get(name)?.kind === 'file'
    && files.get(name).sha256 === digest) ? 'reviewed-tax-and-category-boundary' : 'unknown'
}
export function requireTaxStorageCompatibility(manifest) {
  if (taxStorageCompatibility(manifest) !== 'reviewed-tax-and-category-boundary') {
    throw new Error('tax_storage_compatibility_unknown')
  }
}
