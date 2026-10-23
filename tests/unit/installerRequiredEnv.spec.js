import { test } from '@japa/runner'
import process from 'node:process'
import { mkdtemp, writeFile, readFile, symlink, lstat, stat, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'
import { URL } from 'node:url'
import { EnvParser } from '@adonisjs/core/env'
import { configureRequiredEnvironment, selectRequirements, encodeAnswer } from '../../installer/configureInstallerEnv.mjs'

const metadata = [
  { type: 'prompt', name: 'SMTP_PASSWORD', prompt: 'SMTP password', secret: true, allowEmpty: false },
  { type: 'prompt', name: 'PLAID_PRODUCTION_SECRET', prompt: 'Production secret', secret: true, allowEmpty: false, environments: ['production'] },
]

test.group('Installer required settings (temporary configuration only)', (group) => {
  let root
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'spendcraft-required-env-'))
    return () => rm(root, { recursive: true, force: true })
  })
  async function fixture(contents, requirements = metadata) {
    await writeFile(join(root, 'shared-env'), contents, { mode: 0o600 })
    await symlink('shared-env', join(root, '.env'))
    await writeFile(join(root, 'required.json'), JSON.stringify(requirements))
    return { envFile: join(root, '.env'), requirementsFile: join(root, 'required.json'), target: 'staging', notify: () => undefined }
  }
  test('prompts only for the selected environment, confirms secrets and preserves shared configuration', async ({ assert }) => {
    const original = '# unchanged\nAPP_KEY=preserved\nSMTP_PASSWORD=\n'
    const options = await fixture(original)
    const prompts = [], messages = []
    const secret = 'synthetic#secret=with spaces'
    const changed = await configureRequiredEnvironment({ ...options, notify: (message) => messages.push(message), ask: async (entry) => { prompts.push(entry); return secret } })
    assert.deepEqual(changed, ['SMTP_PASSWORD'])
    assert.lengthOf(prompts, 2)
    assert.isTrue(prompts.every((entry) => entry.secret && entry.name === 'SMTP_PASSWORD'))
    const contents = await readFile(join(root, 'shared-env'), 'utf8')
    assert.isTrue(contents.startsWith(original))
    assert.equal(parseEnv(contents).SMTP_PASSWORD, secret)
    assert.equal((await new EnvParser(contents, new URL('file:///unused/'), { ignoreProcessEnv: true }).parse()).SMTP_PASSWORD, secret)
    assert.isTrue((await lstat(options.envFile)).isSymbolicLink())
    assert.equal((await stat(join(root, 'shared-env'))).mode & 0o777, 0o600)
    assert.notInclude(messages.join('\n'), secret)
    await configureRequiredEnvironment({ ...options, ask: async () => { throw Error('Existing value must not prompt') } })
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
  })
  test('production requests its production-only secret', async ({ assert }) => {
    const options = await fixture('SMTP_PASSWORD=existing\n')
    const names = []
    await configureRequiredEnvironment({ ...options, target: 'production', ask: async (entry) => { names.push(entry.name); return 'synthetic-production-secret' } })
    assert.deepEqual(names, ['PLAID_PRODUCTION_SECRET', 'PLAID_PRODUCTION_SECRET'])
  })
  test('cancellation after an earlier answer saves none of the answers', async ({ assert }) => {
    const original = '# preserve\n'
    const options = await fixture(original)
    let questions = 0
    await assert.rejects(() => configureRequiredEnvironment({ ...options, target: 'production', ask: async () => {
      if (++questions === 3) throw Error('cancelled')
      return 'synthetic-secret'
    } }))
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
  })
  test('empty required values and mismatched confirmation reprompt without logging values', async ({ assert }) => {
    const options = await fixture('')
    const answers = ['', 'first-secret', 'different-secret', 'final-secret', 'final-secret']
    const messages = []
    await configureRequiredEnvironment({ ...options, ask: async () => answers.shift(), notify: (value) => messages.push(value) })
    assert.include(messages.join('\n'), 'confirmation did not match')
    assert.notInclude(messages.join('\n'), 'first-secret')
    assert.equal(parseEnv(await readFile(join(root, 'shared-env'), 'utf8')).SMTP_PASSWORD, 'final-secret')
  })
  test('optional empty settings are preserved or explicitly supplied', async ({ assert }) => {
    const required = [{ type: 'prompt', name: 'REDIS_PASSWORD', prompt: 'Redis password', secret: true, allowEmpty: true }]
    const options = await fixture('REDIS_PASSWORD=\n', required)
    await configureRequiredEnvironment({ ...options, ask: async () => { throw Error('No prompt expected') } })
    await writeFile(join(root, 'shared-env'), '')
    let prompts = 0
    await configureRequiredEnvironment({ ...options, ask: async () => { prompts++; return '' } })
    assert.equal(prompts, 1)
    assert.strictEqual(parseEnv(await readFile(join(root, 'shared-env'), 'utf8')).REDIS_PASSWORD, '')
  })
  test('concurrent environment edits are not overwritten and temporary secrets are removed', async ({ assert }) => {
    const options = await fixture('')
    await assert.rejects(() => configureRequiredEnvironment({ ...options, ask: async () => {
      await writeFile(join(root, 'shared-env'), 'CHANGED=externally\n')
      return 'synthetic-secret'
    } }), 'Environment file changed while prompting; no prompted values were saved')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), 'CHANGED=externally\n')
    assert.isFalse((await readdir(root)).some((name) => name.endsWith('.tmp')))
  })
  test('Plaid environment is assigned from the deployment target without prompting')
    .with(['production', 'staging']).run(async ({ assert }, target) => {
      const required = JSON.parse(await readFile('installer/installer.env.required.json', 'utf8'))
      const options = await fixture('PLAID_ENV=\n', required.filter((entry) => entry.name === 'PLAID_ENV'))
      assert.isTrue(required.filter((entry) => entry.name === 'PLAID_ENV').every((entry) => !Object.hasOwn(entry, 'prompt')))
      const expected = target === 'production' ? 'production' : 'sandbox'
      const ask = async () => { throw Error('Value settings must not prompt') }
      assert.deepEqual(await configureRequiredEnvironment({ ...options, target, ask }), ['PLAID_ENV'])
      const contents = await readFile(join(root, 'shared-env'), 'utf8')
      assert.equal(parseEnv(contents).PLAID_ENV, expected)
      assert.deepEqual(await configureRequiredEnvironment({ ...options, target, ask }), [])
      assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
      await writeFile(join(root, 'shared-env'), '')
      const result = spawnSync(process.execPath, [resolve('installer/configureInstallerEnv.mjs'), '--target', target, '--env-file', options.envFile, '--requirements', options.requirementsFile], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(parseEnv(await readFile(join(root, 'shared-env'), 'utf8')).PLAID_ENV, expected)
    })
  test('staging rejects an existing production Plaid environment without changing it', async ({ assert }) => {
    const required = JSON.parse(await readFile('installer/installer.env.required.json', 'utf8'))
    const options = await fixture('PLAID_ENV=production\n', required.filter((entry) => entry.name === 'PLAID_ENV'))
    await assert.rejects(() => configureRequiredEnvironment(options), 'PLAID_ENV: configured value is not allowed for staging; existing file was preserved')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), 'PLAID_ENV=production\n')
    assert.isFalse(selectRequirements(required, 'staging').some((entry) => entry.name === 'PLAID_PRODUCTION_SECRET'))
  })
  test('metadata file errors identify the supplied path without printing contents')
    .with(['missing', 'invalid']).run(async ({ assert }, kind) => {
      const options = await fixture('')
      if (kind === 'missing') await rm(options.requirementsFile)
      else await writeFile(options.requirementsFile, 'invalid-json-private-marker')
      await assert.rejects(() => configureRequiredEnvironment(options),
        `Cannot read or parse required-settings file ${JSON.stringify(options.requirementsFile)}`)
      assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), '')
    })
  test('missing inputs cannot be collected without a TTY', async ({ assert }) => {
    const options = await fixture('')
    const result = spawnSync(process.execPath, [resolve('installer/configureInstallerEnv.mjs'), '--target', 'staging', '--env-file', options.envFile, '--requirements', options.requirementsFile], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.include(result.stderr, 'Interactive terminal required')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), '')
  })
  test('real terminal hides secrets and handles cancellation/EOF without partial saves')
    .with(['success', 'editing', 'public', 'cancel', 'eof']).run(async ({ assert }, scenario) => {
      const options = await fixture('', [{ ...metadata[0], secret: scenario !== 'public' }])
      const result = spawnSync('python3', ['-c', `
import pty,subprocess,os,select,time,json,sys
master,slave=pty.openpty()
child=subprocess.Popen([sys.argv[1],sys.argv[2],'--target','staging','--env-file',sys.argv[3],'--requirements',sys.argv[4]],stdin=slave,stdout=slave,stderr=slave,close_fds=True,env={**os.environ,'TERM':'xterm'})
os.close(slave)
transcript=b'';pending=b'';sent=0;visible=True;deadline=time.monotonic()+8
while time.monotonic()<deadline:
 ready,_,_=select.select([master],[],[],.1)
 if ready:
  try:chunk=os.read(master,4096)
  except OSError:break
  if not chunk:break
  transcript+=chunk;pending+=chunk
  if b'[SMTP_PASSWORD]: ' in pending and b'*' not in pending.rsplit(b'[SMTP_PASSWORD]: ',1)[-1]:
   while select.select([master],[],[],.1)[0]:
    extra=os.read(master,4096);pending+=extra;transcript+=extra
   if sys.argv[5]=='public':
    os.write(master,b's')
    while select.select([master],[],[],.1)[0]:
     extra=os.read(master,4096);pending+=extra;transcript+=extra
   visible=visible and b'[SMTP_PASSWORD]: ' in pending.split(b'\\x1b[0J')[-1]
   answer=b'synthetic-hidden-secret\\r' if sys.argv[5] in ('success','editing','public') else b'\\x03' if sys.argv[5]=='cancel' else b'\\x04'
   if sys.argv[5]=='editing':
    for part in [b'synthetic-hidden-secreX',b'\\x7f',b't']:
     os.write(master,part)
     while select.select([master],[],[],.1)[0]:
      extra=os.read(master,4096);pending+=extra;transcript+=extra
    answer=b'\\r'
   os.write(master,answer[1:] if sys.argv[5]=='public' else answer);sent+=1;pending=b''
 if child.poll() is not None:break
if child.poll() is None:child.kill()
code=child.wait();os.close(master)
print(json.dumps({'code':code,'answers':sent,'visible':visible,'masked':b'***********************' in transcript,'secretEchoed':b'synthetic-hidden-secret' in transcript}))
`, process.execPath, resolve('installer/configureInstallerEnv.mjs'), options.envFile, options.requirementsFile, scenario], { encoding: 'utf8', timeout: 12000 })
      assert.equal(result.status, 0, result.stderr)
      const observed = JSON.parse(result.stdout)
      assert.isTrue(observed.visible, 'Prompt must remain visible after readline clears/redraws the terminal')
      assert.equal(observed.secretEchoed, scenario === 'public')
      if (['success', 'editing'].includes(scenario)) assert.isTrue(observed.masked, 'Secret entry displays asterisks')
      assert.equal(observed.code, ['success', 'editing', 'public'].includes(scenario) ? 0 : 1)
      const saved = await readFile(join(root, 'shared-env'), 'utf8')
      if (['success', 'editing', 'public'].includes(scenario)) assert.equal(parseEnv(saved).SMTP_PASSWORD, 'synthetic-hidden-secret')
      else assert.equal(saved, '')
    })
  test('unsafe encodings reject instead of changing secret meanings').with(['contains$dollar', 'file:/private/path', 'multiline\nvalue', 'all"three\'quotes`']).run(({ assert }, value) => {
    assert.throws(() => encodeAnswer('SMTP_PASSWORD', value))
  })
  test('quoted secrets and escaped key newlines round-trip without shell execution').with(['plain', 'with # hash', 'contains"double', 'both"and\'quotes', 'literal\\nkey']).run(async ({ assert }, value) => {
    const line = encodeAnswer('JWT_PRIVATE_KEY', value)
    assert.equal(parseEnv(line).JWT_PRIVATE_KEY, value)
    assert.equal((await new EnvParser(line, new URL('file:///unused/'), { ignoreProcessEnv: true }).parse()).JWT_PRIVATE_KEY, value)
  })
  test('explicit types validate value settings and interactive prompts', ({ assert }) => {
    const fixed = { name: 'FIXED', type: 'value', value: 'configured' }
    assert.deepEqual(selectRequirements([fixed], 'staging'), [fixed])
    const mapped = { name: 'PLAID_ENV', type: 'value', value: { production: 'production', staging: 'sandbox' } }
    assert.equal(selectRequirements([mapped], 'staging')[0].value, 'sandbox')
    for (const entry of [
      { ...fixed, type: undefined }, { ...fixed, type: 'unknown' },
      { ...fixed, prompt: 'Unused' }, { ...fixed, value: undefined },
      { ...fixed, value: { production: 'production' } }, { ...fixed, value: { staging: false, production: 'production' } },
      { ...fixed, value: { staging: 'sandbox', production: 'production', typo: 'wrong' } },
      { ...fixed, value: [] }, { ...fixed, value: null }, { ...fixed, value: 'bad$dollar' },
      { ...metadata[0], prompt: undefined }, { ...metadata[0], value: 'unexpected' },
    ]) assert.throws(() => selectRequirements([entry], 'staging'))
    for (const prompt of ['', null, 42, 'invalid\nprompt']) {
      assert.throws(() => selectRequirements([{ ...metadata[0], prompt }], 'staging'))
    }
  })
  test('numeric automatic values are unquoted and strings stay quoted, with idempotent saves', async ({ assert }) => {
    const entries = [
      { name: 'PORT', type: 'value', value: 3334 },
      { name: 'ZERO', type: 'value', value: 0 },
      { name: 'NEGATIVE', type: 'value', value: -42 },
      { name: 'FRACTION', type: 'value', value: 1.25 },
      { name: 'SMALL', type: 'value', value: 1e-7 },
      { name: 'LARGE', type: 'value', value: 1e21 },
      { name: 'TEXT', type: 'value', value: '3334' },
    ]
    const options = await fixture('', entries)
    const ask = async () => { throw Error('Automatic values must not prompt') }
    await configureRequiredEnvironment({ ...options, ask })
    const contents = await readFile(join(root, 'shared-env'), 'utf8')
    const parsed = parseEnv(contents)
    const adonis = await new EnvParser(contents, new URL('file:///unused/'), { ignoreProcessEnv: true }).parse()
    for (const entry of entries) {
      const assignment = typeof entry.value === 'number' ? `${entry.name}=${entry.value}` : `${entry.name}="${entry.value}"`
      assert.include(contents.split('\n'), assignment)
      assert.strictEqual(parsed[entry.name], String(entry.value))
      assert.strictEqual(adonis[entry.name], String(entry.value))
    }
    assert.deepEqual(await configureRequiredEnvironment({ ...options, ask }), [])
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
  })
  test('environment maps support numeric and textual values without losing zero')
    .with(['production', 'staging']).run(async ({ assert }, target) => {
      const entries = [
        { name: 'PORT', type: 'value', value: { production: 3334, staging: 3335 } },
        { name: 'MIXED', type: 'value', value: { production: 0, staging: 'disabled' } },
      ]
      const options = await fixture('', entries)
      await configureRequiredEnvironment({ ...options, target })
      const contents = await readFile(join(root, 'shared-env'), 'utf8')
      assert.include(contents.split('\n'), target === 'production' ? 'PORT=3334' : 'PORT=3335')
      assert.include(contents.split('\n'), target === 'production' ? 'MIXED=0' : 'MIXED="disabled"')
      assert.deepEqual(await configureRequiredEnvironment({ ...options, target }), [])
    })
  test('nonfinite numbers and unsupported scalar types fail before saving').with([
    NaN, Infinity, -Infinity, true, false, null, [],
  ]).run(({ assert }, value) => {
    assert.throws(() => selectRequirements([{ name: 'BAD', type: 'value', value }], 'staging'))
    assert.throws(() => selectRequirements([{ name: 'BAD', type: 'value', value: { production: value, staging: 42 } }], 'production'))
    if (typeof value === 'number') assert.throws(() => encodeAnswer('BAD', value))
  })
  test('a conflicting existing numeric value is preserved and rejected', async ({ assert }) => {
    const original = 'PORT=3333\n'
    const options = await fixture(original, [{ name: 'PORT', type: 'value', value: 3334 }])
    await assert.rejects(() => configureRequiredEnvironment(options), 'PORT: configured value is not allowed for staging; existing file was preserved')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), original)
  })
  test('value entries support fixed values and preserve matching configuration without a terminal', async ({ assert }) => {
    const options = await fixture('', [{ name: 'FIXED', type: 'value', value: 'configured' }])
    const ask = async () => { throw Error('Value settings never prompt') }
    assert.deepEqual(await configureRequiredEnvironment({ ...options, ask }), ['FIXED'])
    const contents = await readFile(join(root, 'shared-env'), 'utf8')
    assert.equal(parseEnv(contents).FIXED, 'configured')
    assert.deepEqual(await configureRequiredEnvironment({ ...options, ask }), [])
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
  })
  test('empty fixed values are idempotent and fixed values are not saved on later cancellation', async ({ assert }) => {
    const fixed = { name: 'FIXED', type: 'value', value: '' }
    const options = await fixture('', [fixed])
    assert.deepEqual(await configureRequiredEnvironment(options), ['FIXED'])
    const contents = await readFile(join(root, 'shared-env'), 'utf8')
    assert.strictEqual(parseEnv(contents).FIXED, '')
    assert.deepEqual(await configureRequiredEnvironment(options), [])
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), contents)
    await writeFile(options.requirementsFile, JSON.stringify([{ ...fixed, value: 'configured' }, metadata[0]]))
    await writeFile(join(root, 'shared-env'), '')
    await assert.rejects(() => configureRequiredEnvironment({ ...options, ask: async () => { throw Error('Cancelled') } }))
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), '')
  })
  test('prompt entries still ask even with one permitted choice', async ({ assert }) => {
    const options = await fixture('', [{ type: 'prompt', name: 'CHOICE', prompt: 'Choose', secret: false, allowEmpty: false, choices: ['only'] }])
    let prompts = 0
    await configureRequiredEnvironment({ ...options, ask: async () => { prompts++; return 'only' } })
    assert.equal(prompts, 1)
  })
  test('metadata diagnostics identify invalid fields and entries without disclosing values', ({ assert }) => {
    assert.throws(() => selectRequirements([
      { name: 'REDIS_PASSWORD', type: 'value', value: 'synthetic-private-value', allowEmpty: true },
    ], 'staging'), 'Required-settings entry 1 (REDIS_PASSWORD): field allowEmpty is not allowed for type value')
    try {
      selectRequirements([{ name: 'PASSWORD', type: 'value', value: 'synthetic-private-value', unexpected: true }], 'production')
      assert.fail('Expected invalid metadata')
    } catch (error) {
      assert.include(error.message, '(PASSWORD): field unexpected')
      assert.notInclude(error.message, 'synthetic-private-value')
    }
  })
  test('invalid, duplicate or APP_KEY metadata is rejected').with([
    [{ ...metadata[0], name: 'APP_KEY' }], [{ ...metadata[0], default: 'forbidden' }], [metadata[0], metadata[0]],
  ]).run(({ assert }, value) => assert.throws(() => selectRequirements(value, 'staging')))
  test('installer packages metadata/helper and generates keys before prompts, backups, migrations and process startup', async ({ assert }) => {
    const config = await readFile('adonisrc.ts', 'utf8')
    for (const file of ['installer/installer.env.required.json', 'installer/configureInstallerEnv.mjs']) assert.include(config, `pattern: '${file}'`)
    const source = await readFile('installer/install.sh0', 'utf8')
    const call = source.indexOf('\nnode installer/configureInstallerEnv.mjs')
    assert.isAbove(call, source.indexOf('\nnpm ci --omit dev --omit optional'))
    assert.notInclude(source, 'ensure_env_defaults')
    assert.isAbove(call, source.indexOf('\nensure_app_key\n'))
    assert.isAbove(call, source.indexOf('\nENV_PATH= NODE_ENV=production node ace generate:web-push-keys\n'))
    assert.isBelow(call, source.indexOf('\nbash "$SPENDCRAFT_ROOT/$APP_NEW/installer/backup.sh"'))
    assert.include(source, '--target "$INSTALL_TARGET"')
    assert.include(source, '--requirements installer/installer.env.required.json')
  })
})
