// Application-only orchestration; no database mutation or monetary conversion.
import { isIP } from 'node:net'
import { URL } from 'node:url'

export function normalizedIP(value) {
  if (typeof value !== 'string') throw new Error('invalid_loopback_address')
  const [address, prefix, ...rest] = value.split('/')
  const version = isIP(address)
  if (!version || rest.length || (prefix !== undefined && prefix !== (version === 4 ? '32' : '128'))) throw new Error('invalid_loopback_address')
  if (address === '127.0.0.1') return address
  const canonical = version === 6 ? new URL(`http://[${address}]/`).hostname : address
  if (canonical === '[::1]') return '::1'
  if (canonical === '[::ffff:7f00:1]') return '127.0.0.1'
  throw new Error('non_loopback_address')
}

export const WARNING = 'This operation restores the previous compatible SpendCraft application release. Database values will not be converted or restored. Historical conversion recovery is a separate operation.'

export async function swapDirectories(paths, operations) {
  const { live, previous, stage, retained, identities } = paths
  await operations.guard()
  if (await operations.identity(live) !== identities.current || await operations.identity(previous) !== identities.previous
    || await operations.identity(stage) !== identities.previous) throw new Error('release_changed_before_swap')
  if (await operations.exists(retained)) throw new Error('recovery_destination_exists')
  await operations.journal('swap-pending', { live, previous, stage, retained })
  await operations.rename(live, retained)
  await operations.sync()
  await operations.journal('current-release-retained', { retained })
  if (await operations.exists(live)) throw new Error('live_destination_reappeared')
  await operations.rename(stage, live)
  await operations.sync()
  if (await operations.identity(live) !== identities.previous) throw new Error('restored_release_mismatch')
  await operations.journal('previous-release-restored', { live, previous, retained })
}

export async function orchestrate(options, operations) {
  await operations.preflight()
  if (options.dryRun) return operations.inspect()
  await operations.inspect() // Verify release/target before confirmation or process shutdown.
  await operations.confirm(WARNING, options.confirmation)
  await operations.journal('execution-approved', {})
  let stopped = false
  try {
    // Set this before stop so even partial stop failures never automatically resume.
    stopped = true
    await operations.stop()
    await operations.journal('writers-stopped', {})
    await operations.backup()
    await operations.swap()
    if (options.manualRestart) {
      await operations.journal('manual-restart-required', {})
      return { manualRestartRequired: true }
    }
    await operations.restart()
    await operations.smoke()
    await operations.journal('complete', {})
  } catch (error) {
    if (stopped) {
      try { await operations.stop() } catch { /* Keep the original failure; journal remains incomplete. */ }
    }
    throw error
  }
}
