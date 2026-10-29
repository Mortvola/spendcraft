// Application-only orchestration; no database mutation or monetary conversion.
import { isIP } from 'node:net'
import { URL } from 'node:url'

export function normalizedIP(value) {
  if (typeof value !== 'string') throw new Error('invalid_loopback_address')
  const [address, prefix, ...rest] = value.split('/')
  const version = isIP(address)
  if (!version || rest.length || (prefix !== undefined && prefix !== (version === 4 ? '32' :
    '128'))) throw new Error('invalid_loopback_address')
  if (address === '127.0.0.1') return address
  const canonical = version === 6 ? new URL(`http://[${address}]/`).hostname : address
  if (canonical === '[::1]') return '::1'
  if (canonical === '[::ffff:7f00:1]') return '127.0.0.1'
  throw new Error('non_loopback_address')
}

export const WARNING =
  'This operation restores the previous compatible SpendCraft application release. The outgoing \
release will be removed and spendcraft.old consumed. Database values will not be converted or \
restored. Historical conversion recovery is a separate operation.'

// One-way restoration: retain the outgoing tree until restoration and runtime health are verified.
// Renames/removal are journaled, not one atomic operation; never auto-retry an interruption.
export async function swapDirectories(paths, operations) {
  const { live, previous, temporary, identities } = paths
  if (!await operations.exists(previous)) throw new Error('no_previous_installed_release')
  await operations.guard()
  if (await operations.identity(live) !== identities.current || await operations.identity(
    previous) !== identities.previous) {
    throw new Error('release_changed_before_swap')
  }
  if (await operations.exists(temporary)) throw new Error('swap_temporary_exists')
  await operations.journal('swap-pending', { live, previous, temporary })
  await operations.rename(live, temporary)
  await operations.sync()
  await operations.journal('current-release-temporary', { temporary })
  if (await operations.exists(live) || await operations.identity(previous) !== identities
    .previous) throw new Error('swap_state_changed')
  await operations.rename(previous, live)
  await operations.sync()
  await operations.journal('previous-release-promoted', { live, temporary })
  if (await operations.exists(previous) || await operations.identity(live) !== identities.previous
    || await operations.identity(temporary) !== identities.current) throw new Error(
      'swap_state_changed')
  await operations.journal('filesystem-restoration-verified', { live, temporary })
}

export async function cleanupOutgoingRelease(paths, operations) {
  const { live, previous, temporary, identities } = paths
  await operations.verifyHealth()
  // Reverify runtime health, safe cleanup admission and both identities before irreversible
  // cleanup.
  await operations.guard()
  if (await operations.identity(live) !== identities.previous || await operations.identity(
    temporary) !== identities.current
    || await operations.exists(previous)) throw new Error('swap_state_changed')
  await operations.journal('outgoing-release-removal-pending', { live, temporary })
  await operations.remove(temporary)
  await operations.sync()
  if (await operations.identity(live) !== identities.previous || await operations.exists(previous)
    || await operations.exists(temporary)) throw new Error('restored_release_mismatch')
  await operations.journal('one-way-rollback-completed', { live })
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
      return { manualRestartRequired: true, completed: false }
    }
    await operations.restart()
    await operations.smoke()
    await operations.cleanup()
    await operations.journal('complete', {})
  } catch (error) {
    if (stopped) {
      try { await operations.stop() } catch {
        /* Keep the original failure; journal remains incomplete. */ }
    }
    throw error
  }
}
