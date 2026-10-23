// Local release packaging/promotion only. No application bootstrap or remote execution.
import process from 'node:process'
import console from 'node:console'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, lstat, realpath, mkdir, mkdtemp, copyFile, open, chmod, unlink } from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { parseArgs, promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
const execute = promisify(execFile)
const fileNames = ['build.zip', 'install.sh0', 'release-source.json']
const hash = (value) => createHash('sha256').update(value).digest('hex')

async function regularFile(path) {
  if (!(await lstat(path)).isFile()) throw new Error('release_file_must_be_regular')
}
async function fingerprint(path) {
  await regularFile(path)
  const digest = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(path)) { digest.update(chunk); size += chunk.length }
  return { sha256: digest.digest('hex'), size }
}
function validateSource(source) {
  if (source?.format !== 1 || !/^[a-f0-9]{40}$/.test(source.commit ?? '') || typeof source.dirty !== 'boolean'
    || typeof source.builtAt !== 'string' || !Number.isFinite(Date.parse(source.builtAt))) throw new Error('invalid_release_source')
}
function validateTemplate(template) {
  if ((template.match(/^INSTALL_TARGET=unconfigured$/gm) ?? []).length !== 1
    || (template.match(/^___END_OF_SHELL_SCRIPT___$/gm) ?? []).length !== 1
    || !template.trimEnd().endsWith('___END_OF_SHELL_SCRIPT___')) throw new Error('invalid_installer_template')
}
async function writeExclusive(path, value, mode = 0o600) {
  const file = await open(path, 'wx', mode)
  try { await file.writeFile(value); await file.sync() } finally { await file.close() }
}
async function syncDirectory(path) {
  const directory = await open(path, 'r')
  try { await directory.sync() } finally { await directory.close() }
}

export async function packageRelease(root, print = (message) => console.log(message)) {
  root = resolve(root)
  if (await realpath(root) !== root || !(await lstat(join(root, 'build'))).isDirectory()) throw new Error('invalid_build_directory')
  const sourcePath = join(root, 'build/release-source.json')
  await regularFile(sourcePath)
  const source = JSON.parse(await readFile(sourcePath, 'utf8'))
  validateSource(source)
  const templatePath = join(root, 'installer/install.sh0')
  await regularFile(templatePath)
  const template = await readFile(templatePath, 'utf8')
  validateTemplate(template)
  const parent = join(root, 'releases')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  if (await realpath(parent) !== parent) throw new Error('unsafe_release_directory')
  const stamp = new Date(source.builtAt).toISOString().replaceAll(':', '-')
  const directory = await mkdtemp(join(parent, `release-${stamp}-${source.commit.slice(0, 12)}-`))
  print('Release package: ' + directory)
  // A failed build/package leaves a unique incomplete directory, never a previous package.
  await execute('zip', ['-q', '-r', join(directory, 'build.zip'), 'build'], { cwd: root })
  await writeExclusive(join(directory, 'install.sh0'), template)
  await copyFile(sourcePath, join(directory, 'release-source.json'))
  const files = {}
  for (const name of fileNames) {
    files[name] = await fingerprint(join(directory, name))
    const file = await open(join(directory, name), 'r')
    try { await file.sync() } finally { await file.close() }
    await chmod(join(directory, name), 0o444)
  }
  const content = { format: 1, source, files }
  const manifest = { ...content, id: hash(JSON.stringify(content)) }
  await writeExclusive(join(directory, 'release.json'), JSON.stringify(manifest, null, 2) + '\n', 0o444)
  await syncDirectory(directory)
  await syncDirectory(parent)
  print('Release ID: ' + manifest.id)
  print('Application archive SHA256: ' + files['build.zip'].sha256)
  return { directory, manifest }
}

export async function verifyPackage(directory) {
  directory = resolve(directory)
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error('unsafe_release_directory')
  await regularFile(join(directory, 'release.json'))
  const manifest = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'))
  validateSource(manifest.source)
  if (manifest.format !== 1 || !manifest.files || Object.keys(manifest.files).sort().join(',') !== [...fileNames].sort().join(',')) {
    throw new Error('invalid_release_manifest')
  }
  const content = { format: manifest.format, source: manifest.source, files: manifest.files }
  if (manifest.id !== hash(JSON.stringify(content))) throw new Error('release_manifest_identity_mismatch')
  for (const name of fileNames) {
    const actual = await fingerprint(join(directory, name))
    const expected = manifest.files[name]
    if (!expected || actual.sha256 !== expected.sha256 || actual.size !== expected.size) throw new Error('release_checksum_mismatch')
  }
  if (JSON.stringify(JSON.parse(await readFile(join(directory, 'release-source.json'), 'utf8'))) !== JSON.stringify(manifest.source)) {
    throw new Error('release_source_mismatch')
  }
  validateTemplate(await readFile(join(directory, 'install.sh0'), 'utf8'))
  return manifest
}

export async function createInstaller(directory, target, output) {
  if (!['production', 'staging'].includes(target)) throw new Error('explicit_deployment_target_required')
  directory = resolve(directory)
  const manifest = await verifyPackage(directory)
  const savedTemplate = await readFile(join(directory, 'install.sh0'))
  if (hash(savedTemplate) !== manifest.files['install.sh0'].sha256) throw new Error('release_changed_during_packaging')
  const template = savedTemplate.toString('utf8').replace(/^INSTALL_TARGET=unconfigured$/m, 'INSTALL_TARGET=' + target)
  output = join(await realpath(dirname(resolve(output))), basename(output))
  // An installer is disposable upload output, never a mutation of the saved package.
  if (output === directory || output.startsWith(directory + '/')) throw new Error('installer_output_inside_release')
  const file = await open(output, 'wx', 0o700)
  try {
    await file.writeFile(template.endsWith('\n') ? template : template + '\n')
    const digest = createHash('sha256')
    let size = 0, carry = Buffer.alloc(0)
    for await (const chunk of createReadStream(join(directory, 'build.zip'))) {
      digest.update(chunk); size += chunk.length
      const bytes = Buffer.concat([carry, chunk])
      const end = bytes.length - bytes.length % 3
      if (end) await file.writeFile(bytes.subarray(0, end).toString('base64') + '\n')
      carry = bytes.subarray(end)
    }
    if (carry.length) await file.writeFile(carry.toString('base64') + '\n')
    if (digest.digest('hex') !== manifest.files['build.zip'].sha256 || size !== manifest.files['build.zip'].size) {
      throw new Error('release_changed_during_packaging')
    }
    await file.sync()
  } catch (error) {
    await file.close()
    await unlink(output)
    throw error
  }
  await file.close()
  return manifest
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, strict: true, allowPositionals: true, options: {
    root: { type: 'string' }, release: { type: 'string' }, target: { type: 'string' }, output: { type: 'string' },
  } })
  if (positionals.length !== 1) throw new Error('release_package_mode_required')
  if (positionals[0] === 'package' && values.root && !values.release && !values.target && !values.output) {
    await packageRelease(values.root)
  } else if (positionals[0] === 'installer' && values.release && values.target && values.output && !values.root) {
    const manifest = await createInstaller(values.release, values.target, values.output)
    console.log('Verified release ID: ' + manifest.id)
    console.log('Application archive SHA256: ' + manifest.files['build.zip'].sha256)
    console.log('Installer target: ' + values.target)
  } else throw new Error('invalid_release_package_arguments')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const code = /^[a-z][a-z0-9_]+$/.test(error.message) ? error.message
      : typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'inspect_release_package'
    console.error('Release packaging failed: ' + code)
    process.exitCode = 1
  })
}
