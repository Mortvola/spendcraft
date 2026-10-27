// Emit reviewed runtime files in memory: fixtures do not depend on build/ or boot an app.
import ts from 'typescript'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
let compiled
async function taxRuntimeFiles() {
  if (compiled) return compiled
  const profile = JSON.parse(await readFile('installer/tax-storage-profile.json', 'utf8'))
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile)
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, '.').options
  const names = [...new Set([...Object.keys(profile.files), ...Object.keys(profile.statementIncomeFiles),
    ...Object.keys(profile.taxForecastFiles), ...Object.keys(profile.transactionLogFiles)])]
  const program = ts.createProgram(names.map(file => file.replace(/\.js$/, '.ts')), options)
  const files = new Map()
  for (const name of names) {
    const source = program.getSourceFile(name.replace(/\.js$/, '.ts'))
    if (!source) throw new Error('Missing production fixture source')
    program.emit(source, (path, contents) => {
      if (path.endsWith('.js')) files.set(relative(resolve(options.outDir), resolve(path)), contents)
    })
  }
  compiled = files
  return files
}
export async function writeTaxRuntimeFixture(directory, categoryCodec = true) {
  for (const [name, contents] of await taxRuntimeFiles()) {
    if (!categoryCodec && name === 'app/services/categoryAmountCodec.js') continue
    const path = resolve(directory, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
}
