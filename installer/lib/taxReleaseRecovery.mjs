// Filesystem-only recognition of reviewed tax, Category and Statement storage.
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
export function statementIncomeStorageCompatibility(manifest) {
  if (manifest?.format !== 1 || !Array.isArray(manifest.files)
    || manifest.identity !== hash(JSON.stringify(manifest.files))
    || !profile.statementIncomeFiles || Object.keys(profile.statementIncomeFiles).length !== 4) return 'unknown'
  const files = new Map(manifest.files.map(file => [file.name, file]))
  // Pin model hydration/serialization, the codec, storage lifecycle and API writers.
  // Commit labels, marker files and the mere presence of a decoder cannot admit a release.
  return Object.entries(profile.statementIncomeFiles).every(([name, digest]) => files.get(name)?.kind === 'file'
    && files.get(name).sha256 === digest) ? 'reviewed-statement-income-boundary' : 'unknown'
}
export function taxForecastStorageCompatibility(manifest) {
  if (manifest?.format !== 1 || !Array.isArray(manifest.files)
    || manifest.identity !== hash(JSON.stringify(manifest.files))
    || !profile.taxForecastFiles || Object.keys(profile.taxForecastFiles).length !== 4) return 'unknown'
  const files = new Map(manifest.files.map(file => [file.name, file]))
  return Object.entries(profile.taxForecastFiles).every(([name, digest]) => files.get(name)?.kind === 'file'
    && files.get(name).sha256 === digest) ? 'reviewed-tax-forecast-boundary' : 'unknown'
}
export function transactionLogStorageCompatibility(manifest) {
  if (manifest?.format !== 1 || !Array.isArray(manifest.files)
    || manifest.identity !== hash(JSON.stringify(manifest.files))
    || !profile.transactionLogFiles || Object.keys(profile.transactionLogFiles).length !== 3) return 'unknown'
  const files = new Map(manifest.files.map(file => [file.name, file]))
  return Object.entries(profile.transactionLogFiles).every(([name, digest]) => files.get(name)?.kind === 'file'
    && files.get(name).sha256 === digest) ? 'reviewed-transaction-log-boundary' : 'unknown'
}
export function requireTaxStorageCompatibility(manifest) {
  if (taxForecastStorageCompatibility(manifest) !== 'reviewed-tax-forecast-boundary') {
    throw new Error('tax_forecast_storage_compatibility_unknown')
  }
  if (transactionLogStorageCompatibility(manifest) !== 'reviewed-transaction-log-boundary') {
    throw new Error('transaction_log_storage_compatibility_unknown')
  }
  if (taxStorageCompatibility(manifest) !== 'reviewed-tax-and-category-boundary') {
    throw new Error('tax_storage_compatibility_unknown')
  }
  if (statementIncomeStorageCompatibility(manifest) !== 'reviewed-statement-income-boundary') {
    throw new Error('statement_income_storage_compatibility_unknown')
  }
}
