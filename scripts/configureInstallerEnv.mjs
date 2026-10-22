// Installer configuration only. No application bootstrap or database imports.
import process from 'node:process'
import console from 'node:console'
import { readFile, realpath, open, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseArgs, parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createInterface, clearLine, cursorTo } from 'node:readline'
import { Writable } from 'node:stream'

class ConfigurationError extends Error {}
function fail(message) { throw new ConfigurationError(message) }
function hasControlCharacters(value) {
  return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}

export function selectRequirements(metadata, target) {
  const targets = ['production', 'staging']
  if (!targets.includes(target)) fail('Explicit production or staging target required')
  if (!Array.isArray(metadata)) fail('Required-settings metadata must be an array')
  const selected = []
  for (const [index, entry] of metadata.entries()) {
    const location = `Required-settings entry ${index + 1}`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || typeof entry.name !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(entry.name)) fail(`${location}: valid name required`)
    const invalid = (reason) => fail(`${location} (${entry.name}): ${reason}`)
    if (entry.name === 'APP_KEY') invalid('APP_KEY is managed by its key generator')
    if (!['value', 'prompt'].includes(entry.type)) invalid('type must be value or prompt')
    if (entry.environments !== undefined && (!Array.isArray(entry.environments) || !entry.environments.length
      || entry.environments.some((value) => !targets.includes(value)))) invalid('environments must list production or staging')
    const fields = entry.type === 'value'
      ? ['name', 'type', 'value', 'environments']
      : ['name', 'type', 'prompt', 'secret', 'allowEmpty', 'environments', 'choices']
    const unsupported = Object.keys(entry).find((key) => !fields.includes(key))
    if (unsupported !== undefined) {
      const field = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(unsupported) ? `field ${unsupported}` : 'field'
      invalid(`${field} is not allowed for type ${entry.type}`)
    }
    if (entry.type === 'prompt') {
      if (typeof entry.prompt !== 'string' || !entry.prompt || hasControlCharacters(entry.prompt)
        || typeof entry.secret !== 'boolean' || typeof entry.allowEmpty !== 'boolean'
        || (entry.choices !== undefined && (!Array.isArray(entry.choices) || !entry.choices.length
          || entry.choices.some((value) => typeof value !== 'string' || !value)))) invalid('prompt requires nonempty prompt text, boolean secret/allowEmpty and valid optional choices')
    } else {
      const mapped = typeof entry.value !== 'string' && typeof entry.value !== 'number'
      if (mapped && (!entry.value || Array.isArray(entry.value) || typeof entry.value !== 'object'
        || !Object.keys(entry.value).length || Object.keys(entry.value).some((key) => !targets.includes(key)))) invalid('value must be a string, a finite number or a production/staging map')
      for (const value of mapped ? Object.values(entry.value) : [entry.value]) {
        if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) invalid('value settings must contain strings or finite numbers')
        encodeAnswer(entry.name, value)
      }
      if (mapped && (entry.environments || targets).some((environment) => !Object.hasOwn(entry.value, environment))) invalid('value is missing an applicable environment')
    }
    if (!entry.environments || entry.environments.includes(target)) {
      if (selected.some((other) => other.name === entry.name)) invalid('duplicate setting for selected environment')
      selected.push(entry.type === 'value' && typeof entry.value === 'object'
        ? { ...entry, value: entry.value[target] } : entry)
    }
  }
  return selected
}

export function encodeAnswer(name, value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${name}: numeric value must be finite`)
    return `${name}=${String(value)}`
  }
  if (typeof value !== 'string' || hasControlCharacters(value)) fail(`${name}: enter a single-line value`)
  // Adonis interpolates $ even in quoted .env values. Reject unsupported input
  // rather than silently changing a password or interpreting a file: identifier.
  if (value.includes('$') || /^file\\?:/.test(value)) fail(`${name}: dollar interpolation and file identifiers are not supported`)
  for (const quote of ['"', "'", '`']) {
    if (!value.includes(quote)) {
      const line = `${name}=${quote}${value}${quote}`
      if (parseEnv(line)[name] === value) return line
    }
  }
  fail(`${name}: value cannot be safely encoded as one .env line`)
}

export async function terminalAnswer(entry) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('Interactive terminal required for missing settings; configure the environment file manually or rerun interactively')
  // Render the question through readline so redraws retain the prompt.
  // Mute only after its initial rendering to prevent secret input from echoing.
  let muted = false
  const output = new Writable({ write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding)
    callback()
  } })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  const prompt = `${entry.prompt} [${entry.name}]: `
  const showMask = (_character, key) => {
    if (!entry.secret || key?.name === 'return' || key?.name === 'enter' || key?.ctrl && ['c', 'd'].includes(key.name)) return
    // readline has already applied editing keys. Render only its masked state;
    // never forward its unmasked terminal output or log the entered value.
    const mask = '*'.repeat([...rl.line].length)
    const beforeCursor = [...rl.line.slice(0, rl.cursor)].length
    const width = Math.max(1, (process.stdout.columns || 80) - 1)
    const display = prompt + mask
    const cursor = prompt.length + beforeCursor
    const start = Math.max(0, cursor - width)
    cursorTo(process.stdout, 0)
    clearLine(process.stdout, 0)
    process.stdout.write(display.slice(start, start + width))
    cursorTo(process.stdout, cursor - start)
  }
  process.stdin.on('keypress', showMask)
  try {
    return await new Promise((resolveAnswer, rejectAnswer) => {
      rl.once('SIGINT', () => rejectAnswer(new ConfigurationError('Configuration cancelled; no prompted values were saved')))
      rl.once('close', () => rejectAnswer(new ConfigurationError('Input ended; no prompted values were saved')))
      rl.question(prompt, (answer) => resolveAnswer(answer))
      muted = entry.secret
    })
  } finally {
    process.stdin.removeListener('keypress', showMask)
    rl.close()
    if (entry.secret) process.stdout.write('\n')
  }
}

export async function configureRequiredEnvironment({ target, envFile, requirementsFile, ask = terminalAnswer, notify = console.log }) {
  let metadata
  try { metadata = JSON.parse(await readFile(requirementsFile, 'utf8')) }
  catch { fail('Cannot read or parse installer.env.required.json') }
  const requirements = selectRequirements(metadata, target)
  let resolved, original
  try { resolved = await realpath(envFile); original = await readFile(resolved, 'utf8') }
  catch { fail('Cannot read .env or its symlink target') }
  const current = parseEnv(original)
  const answers = []
  for (const entry of requirements) {
    if (Object.hasOwn(current, entry.name) && (current[entry.name] !== '' || entry.allowEmpty || entry.type === 'value' && entry.value === '')) {
      if (entry.type === 'value' ? current[entry.name] !== String(entry.value) : entry.choices && !entry.choices.includes(current[entry.name])) fail(`${entry.name}: configured value is not allowed for ${target}; existing file was preserved`)
      continue
    }
    if (entry.type === 'value') {
      answers.push([entry.name, String(entry.value), encodeAnswer(entry.name, entry.value)])
      continue
    }
    for (;;) {
      const value = await ask(entry)
      if (typeof value !== 'string') fail('Input cancelled; no prompted values were saved')
      if (!value && !entry.allowEmpty) { notify(`${entry.name} must not be empty`); continue }
      if (entry.choices && !entry.choices.includes(value)) { notify(`${entry.name}: enter one of the configured choices`); continue }
      let encoded
      try { encoded = encodeAnswer(entry.name, value) }
      catch (error) { notify(error.message); continue }
      if (entry.secret && value !== '' && await ask({ ...entry, prompt: `Confirm ${entry.name}` }) !== value) {
        notify(`${entry.name}: confirmation did not match`)
        continue
      }
      answers.push([entry.name, value, encoded])
      break
    }
  }
  if (!answers.length) { notify('Existing required environment settings preserved.'); return [] }
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  const separator = original && !original.endsWith('\n') ? newline : ''
  // Appending a final assignment overrides only an existing empty placeholder.
  // Nonempty existing values are never changed, and original text stays intact.
  const next = original + separator + answers.map((entry) => entry[2]).join(newline) + newline
  const parsed = parseEnv(next)
  if (answers.some(([name, value]) => parsed[name] !== value)) fail('Environment encoding verification failed; no prompted values were saved')
  const temporary = join(dirname(resolved), `.installer-env-${randomUUID()}.tmp`)
  let created = false
  try {
    const file = await open(temporary, 'wx', 0o600)
    created = true
    try { await file.writeFile(next); await file.sync() } finally { await file.close() }
    if (await realpath(envFile) !== resolved || await readFile(resolved, 'utf8') !== original) fail('Environment file changed while prompting; no prompted values were saved')
    await rename(temporary, resolved)
    created = false
    const directory = await open(dirname(resolved), 'r')
    try { await directory.sync() } finally { await directory.close() }
  } finally { if (created) await unlink(temporary) }
  notify(`Saved required environment settings: ${answers.map(([name]) => name).join(', ')}`)
  return answers.map(([name]) => name)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { target: { type: 'string' }, 'env-file': { type: 'string' }, requirements: { type: 'string' } } })
    if (!values['env-file'] || !values.requirements) fail('Explicit --env-file and --requirements paths required')
    await configureRequiredEnvironment({ target: values.target, envFile: values['env-file'], requirementsFile: values.requirements })
  } catch (error) {
    // Raw exceptions can contain parser input or secrets; never print them.
    console.error(`Required environment configuration failed: ${error instanceof ConfigurationError ? error.message : 'File operation failed; check paths, permissions and disk space'}. No further installation steps will run.`)
    process.exitCode = 1
  }
}
