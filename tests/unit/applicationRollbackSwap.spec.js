import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, symlink, realpath, rm, rename, readdir, lstat, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { swapDirectories, orchestrate } from '../../installer/lib/applicationRollback.mjs'
import { releaseManifest, verifyReleases, releaseDifferences } from '../../installer/rollbackApplication.mjs'
import { writeTaxRuntimeFixture } from '../helpers/taxRecoveryRelease.js'
const hash = value => createHash('sha256').update(value).digest('hex')

async function release(root, name, version) {
  const dir = join(root, name)
  for (const path of ['bin', 'commands', 'config', 'node_modules', 'public/assets/.vite']) await mkdir(join(dir, path), { recursive: true })
  for (const path of ['ace.js', 'bin/server.js', 'commands/QueueListener.js', 'commands/PlaidCleanupListener.js']) await writeFile(join(dir, path), '// synthetic ' + version)
  await writeTaxRuntimeFixture(dir)
  await writeFile(join(dir, 'config/database.js'), '// unchanged db configuration')
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'spendcraft', type: 'module', dependencies: {} }))
  await writeFile(join(dir, 'package-lock.json'), JSON.stringify({ name: 'spendcraft', lockfileVersion: 3 }))
  await writeFile(join(dir, 'public/assets/.vite/manifest.json'), JSON.stringify({ 'client-src/App.tsx': { isEntry: true, file: 'App.js' } }))
  await writeFile(join(dir, 'public/assets/App.js'), '// client ' + version)
  await symlink(join(root, 'shared-env'), join(dir, '.env'))
}

test.group('One-way application rollback — real temporary compiled releases, no database/PM2', group => {
  let root, paths, plan, output
  group.each.setup(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'two-release-swap-')))
    await writeFile(join(root, 'shared-env'), 'synthetic')
    await writeFile(join(root, 'financial-sentinel.json'), '{"transactions":[1,2],"taxes":["12.35"],"balance":123}')
    await release(root, 'spendcraft', 'current')
    await release(root, 'spendcraft.old', 'previous')
    output = join(root, 'output'); await mkdir(output)
    const current = await releaseManifest(join(root, 'spendcraft')), previous = await releaseManifest(join(root, 'spendcraft.old'))
    await writeFile(join(output, 'current.json'), JSON.stringify(current))
    await writeFile(join(output, 'previous.json'), JSON.stringify(previous))
    plan = { root, currentManifest: join(output, 'current.json'), previousManifest: join(output, 'previous.json'), envFile: join(root, 'shared-env'),
      reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(current, previous))), databaseConfigSha256: hash('// unchanged db configuration') }
    paths = { live: join(root, 'spendcraft'), previous: join(root, 'spendcraft.old'), temporary: join(root, '.spendcraft.rollback-swap-test'), identities: { current: current.identity, previous: previous.identity } }
    return () => rm(root, { recursive: true, force: true })
  })
  async function operations(fail) {
    let renamed = 0, removed = false
    const journal = join(output, 'swap.jsonl'), events = []
    async function inject(point) { events.push(point); if (fail === point) throw new Error('injected_' + point) }
    return { events, get renamed() { return renamed }, get removed() { return removed },
      guard: () => inject(renamed === 2 ? 'guard-cleanup' : 'guard'),
      exists: async path => { try { await lstat(path); return true } catch (error) { if (error.code !== 'ENOENT') throw error; return false } },
      identity: async path => (await releaseManifest(path)).identity,
      rename: async (from, to) => { await inject('rename-' + (renamed + 1) + '-before'); await rename(from, to); renamed++; await inject('rename-' + renamed + '-after') },
      remove: async path => { await inject('remove-before'); await rm(path, { recursive: true, force: false }); removed = true; await inject('remove-after') },
      sync: async () => { const dir = await open(root, 'r'); try { await dir.sync() } finally { await dir.close() }; await inject(removed ? 'sync-cleanup' : 'sync-' + renamed) },
      journal: async (phase, detail) => {
        await inject('journal-' + phase)
        const file = await open(journal, 'a', 0o600)
        try { await file.writeFile(JSON.stringify({ phase, ...detail }) + '\n'); await file.sync() } finally { await file.close() }
      },
    }
  }
  test('one-way rollback consumes old and a subsequent rollback fails without side effects', async ({ assert }) => {
    await verifyReleases(plan, output)
    await swapDirectories(paths, await operations())
    assert.equal((await releaseManifest(paths.live)).identity, paths.identities.previous)
    await assert.rejects(() => lstat(paths.previous))
    await assert.rejects(() => lstat(paths.temporary))
    assert.deepEqual((await readdir(root)).filter(name => name.startsWith('spendcraft')), ['spendcraft'])
    assert.equal(JSON.parse((await readFile(join(output, 'swap.jsonl'), 'utf8')).trim().split('\n').at(-1)).phase, 'one-way-rollback-completed')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), 'synthetic')
    const repeatOutput = join(root, 'repeat-output'); await mkdir(repeatOutput)
    await assert.rejects(() => verifyReleases(plan, repeatOutput), 'no_previous_installed_release')
    const second = await operations()
    await assert.rejects(() => swapDirectories(paths, second), 'no_previous_installed_release')
    assert.deepEqual(second.events, [])
    assert.equal((await releaseManifest(paths.live)).identity, paths.identities.previous)
  })
  test('interruptions preserve the restored release and journaled one-way cleanup state').with([
    'guard', 'journal-swap-pending', 'rename-1-before', 'rename-1-after', 'sync-1', 'journal-current-release-temporary',
    'rename-2-before', 'rename-2-after', 'sync-2', 'journal-previous-release-promoted',
    'guard-cleanup', 'journal-outgoing-release-removal-pending', 'remove-before', 'remove-after', 'sync-cleanup', 'journal-one-way-rollback-completed',
  ]).run(async ({ assert }, fail) => {
    const ops = await operations(fail), before = await readFile(join(root, 'financial-sentinel.json'), 'utf8')
    await assert.rejects(() => swapDirectories(paths, ops), 'injected_' + fail)
    const locations = []
    for (const path of [paths.live, paths.previous, paths.temporary]) if (await ops.exists(path)) locations.push({ path, identity: await ops.identity(path) })
    assert.deepEqual(locations.map(row => row.identity).sort(), ops.removed ? [paths.identities.previous] : Object.values(paths.identities).sort())
    const expected = ops.removed ? [[paths.live, paths.identities.previous]] : [
      [[paths.live, paths.identities.current], [paths.previous, paths.identities.previous]],
      [[paths.temporary, paths.identities.current], [paths.previous, paths.identities.previous]],
      [[paths.temporary, paths.identities.current], [paths.live, paths.identities.previous]],
    ][ops.renamed]
    assert.deepEqual(locations.map(row => [row.path, row.identity]).sort(), expected.sort())
    // Exercise documented manual completion only on the verified phase state.
    // This is not an automatic retry or a new executor bypass.
    if (ops.renamed === 0) { await rename(paths.live, paths.temporary); await rename(paths.previous, paths.live) }
    if (ops.renamed === 1) await rename(paths.previous, paths.live)
    if (!ops.removed) await rm(paths.temporary, { recursive: true, force: false })
    assert.equal((await releaseManifest(paths.live)).identity, paths.identities.previous)
    await assert.rejects(() => lstat(paths.previous))
    assert.equal(await readFile(join(root, 'financial-sentinel.json'), 'utf8'), before)
  })
  test('partial cleanup failure leaves the verified restored release and blocks a second rollback', async ({ assert }) => {
    const ops = await operations()
    ops.remove = async path => { await rm(join(path, 'public/assets/App.js')); throw new Error('partial_cleanup_failure') }
    await assert.rejects(() => swapDirectories(paths, ops), 'partial_cleanup_failure')
    assert.equal((await releaseManifest(paths.live)).identity, paths.identities.previous)
    await assert.rejects(() => lstat(paths.previous))
    assert.isTrue((await lstat(paths.temporary)).isDirectory())
    const phases = (await readFile(join(output, 'swap.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line).phase)
    assert.equal(phases.at(-1), 'outgoing-release-removal-pending')
    await assert.rejects(() => swapDirectories(paths, ops), 'no_previous_installed_release')
    assert.equal(await readFile(join(root, 'shared-env'), 'utf8'), 'synthetic')
  })
  test('abrupt child exit leaves the restored target or the original two trees recoverable').with(['rename-1', 'rename-2', 'remove'])
    .run(async ({ assert }, afterRename) => {
      const script = `import process from 'node:process';
import {rename,lstat,open,rm} from 'node:fs/promises';
import {swapDirectories} from ${JSON.stringify(pathToFileURL(resolve('installer/lib/applicationRollback.mjs')).href)};
import {releaseManifest} from ${JSON.stringify(pathToFileURL(resolve('installer/lib/releaseManifest.mjs')).href)};
const paths=${JSON.stringify(paths)}; let count=0;
await swapDirectories(paths, {guard:async()=>{},identity:async p=>(await releaseManifest(p)).identity,
exists:async p=>{try{await lstat(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}},
journal:async(phase,detail)=>{const f=await open(${JSON.stringify(join(output, 'crash-journal.jsonl'))},'a');try{await f.writeFile(JSON.stringify({phase,...detail})+'\\n');await f.sync()}finally{await f.close()}},
sync:async()=>{const d=await open(${JSON.stringify(root)},'r');try{await d.sync()}finally{await d.close()}},
remove:async p=>{await rm(p,{recursive:true,force:false});if(${JSON.stringify(afterRename)}==='remove')process.exit(77)},
rename:async(a,b)=>{await rename(a,b);if('rename-'+(++count)===${JSON.stringify(afterRename)})process.exit(77)}});`
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
      assert.equal(child.status, 77, child.stderr)
      const ops = await operations(), found = []
      for (const path of [paths.live, paths.previous, paths.temporary]) if (await ops.exists(path)) found.push(await ops.identity(path))
      assert.deepEqual(found.sort(), afterRename === 'remove' ? [paths.identities.previous] : Object.values(paths.identities).sort())
      const journal = (await readFile(join(output, 'crash-journal.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
      assert.equal(journal[0].phase, 'swap-pending')
      assert.notInclude(journal.map(row => row.phase), 'one-way-rollback-completed')
    })
  test('bad compatibility, missing assets/releases and invalid manifests reject before shutdown or journaling').with([
    'tax', 'category', 'asset', 'missing', 'manifest', 'absolute-link',
  ]).run(async ({ assert }, kind) => {
    if (kind === 'absolute-link') {
      await symlink(join(paths.live, 'public/assets/App.js'), join(paths.live, 'absolute-client-link'))
      const current = await releaseManifest(paths.live), previous = await releaseManifest(paths.previous)
      await writeFile(plan.currentManifest, JSON.stringify(current))
      plan.reviewedDifferencesSha256 = hash(JSON.stringify(releaseDifferences(current, previous)))
    }
    if (kind === 'tax') await writeFile(join(paths.previous, 'app/Models/Transaction.js'), '// old unsupported model')
    if (kind === 'category') await rm(join(paths.previous, 'app/services/categoryAmountCodec.js'))
    if (kind === 'asset') await rm(join(paths.previous, 'public/assets/App.js'))
    if (kind === 'missing') await rm(paths.previous, { recursive: true })
    if (kind === 'manifest') await writeFile(plan.previousManifest, '{"format":1,"identity":"invalid","files":[]}')
    const events = []
    const before = await readdir(root), money = await readFile(join(root, 'financial-sentinel.json'), 'utf8')
    const ops = Object.fromEntries(['inspect', 'confirm', 'journal', 'stop', 'backup', 'swap', 'restart', 'smoke'].map(name => [name, async () => { events.push(name) }]))
    ops.preflight = () => verifyReleases(plan, output)
    if (kind === 'missing') await assert.rejects(() => orchestrate({ dryRun: false }, ops), 'no_previous_installed_release')
    else await assert.rejects(() => orchestrate({ dryRun: false }, ops))
    assert.deepEqual(events, [])
    assert.deepEqual(await readdir(root), before)
    assert.equal(await readFile(join(root, 'financial-sentinel.json'), 'utf8'), money)
    await assert.rejects(() => readFile(join(output, 'swap.jsonl')))
  })
  test('orchestration failures never automatically resume writers').with(['confirm', 'stop', 'backup', 'swap', 'restart'])
    .run(async ({ assert }, fail) => {
      const events = [], ops = Object.fromEntries(['inspect', 'confirm', 'journal', 'stop', 'backup', 'swap', 'restart', 'smoke'].map(name => [name, async () => {
        events.push(name); if (name === fail) throw new Error('injected')
      }]))
      ops.preflight = () => verifyReleases(plan, output)
      await assert.rejects(() => orchestrate({ dryRun: false }, ops), 'injected')
      assert.notInclude(events, 'smoke')
      if (fail === 'confirm') assert.notInclude(events, 'stop')
      else assert.equal(events.at(-1), 'stop')
      if (fail !== 'restart') assert.notInclude(events, 'restart')
    })
  test('restored startup and restart failures preserve one-way restoration').with(['success', 'after-stop', 'before-restart', 'restart'])
    .run(async ({ assert }, scenario) => {
      const events = [], money = await readFile(join(root, 'financial-sentinel.json'), 'utf8')
      const ops = {
        preflight: () => verifyReleases(plan, output), inspect: async () => { events.push('inspect') }, confirm: async () => { events.push('confirm') },
        journal: async phase => { if (scenario === 'after-stop' && phase === 'writers-stopped') throw new Error('injected') },
        stop: async () => { events.push('stop') }, backup: async () => { events.push('backup') },
        swap: async () => { await swapDirectories(paths, await operations()); if (scenario === 'before-restart') throw new Error('injected') },
        restart: async () => {
          events.push('restart')
          assert.equal((await releaseManifest(paths.live)).identity, paths.identities.previous)
          await assert.rejects(() => lstat(paths.previous))
          if (scenario === 'restart') throw new Error('injected')
        },
        smoke: async () => { events.push('smoke') },
      }
      if (scenario === 'success') await orchestrate({ dryRun: false }, ops)
      else { await assert.rejects(() => orchestrate({ dryRun: false }, ops), 'injected'); assert.equal(events.at(-1), 'stop'); assert.notInclude(events, 'smoke') }
      if (scenario === 'after-stop' || scenario === 'before-restart') assert.notInclude(events, 'restart')
      const expected = scenario === 'after-stop' ? paths.identities : { current: paths.identities.previous, previous: paths.identities.current }
      assert.equal((await releaseManifest(paths.live)).identity, expected.current)
      if (scenario === 'after-stop') assert.equal((await releaseManifest(paths.previous)).identity, expected.previous)
      else await assert.rejects(() => lstat(paths.previous))
      await assert.rejects(() => lstat(paths.temporary))
      assert.equal(await readFile(join(root, 'financial-sentinel.json'), 'utf8'), money)
    })
  test('executor and installer retain only the established persistent slots', async ({ assert }) => {
    const source = await readFile('installer/rollbackApplication.mjs', 'utf8')
    assert.notInclude(source, 'spendcraft.forward-recovery-')
    assert.notInclude(source, 'await cp(')
    assert.include(source, 'prior_run_requires_recovery_review')
    const installer = await readFile('installer/install.sh0', 'utf8')
    assert.include(installer, 'mv $APP $APP_OLD'); assert.include(installer, 'mv $APP_NEW $APP')
    assert.include(installer, 'SKIP'); assert.notInclude(installer, 'forward-recovery')
  })
})
