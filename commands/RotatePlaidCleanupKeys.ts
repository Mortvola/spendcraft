import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { EnvEditor } from '@adonisjs/env/editor'
import { EnvParser } from '@adonisjs/core/env'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'

export default class RotatePlaidCleanupKeys extends BaseCommand {
  public static commandName = 'plaid:rotate-cleanup-keys'
  public static description = 'Append and activate a new versioned Plaid cleanup key in .env, retaining all old keys'

  static options: CommandOptions = {
    startApp: false,
    staysAlive: false,
  }

  @flags.boolean({ description: 'Initialize missing keys without rotating an existing configured pair' })
  public ifMissing = false

  public async run() {
    try {
      const editor = await EnvEditor.create(this.app.appRoot)
      const file = editor.toJSON().find((entry) => entry.path.endsWith('/.env'))
      if (!file) throw new Error('Missing environment file')
      const contents = file.contents.join('\n')
      const env = parseEnv(contents)
      const active = env.PLAID_CLEANUP_KEY_VERSION || ''
      const parsed: unknown = env.PLAID_CLEANUP_KEYS ? JSON.parse(env.PLAID_CLEANUP_KEYS) : {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid cleanup key map')
      const keys = new Map<string, string>()
      let highest = 0
      for (const [version, secret] of Object.entries(parsed)) {
        if (!version || typeof secret !== 'string' || secret.length < 32) throw new Error('Invalid retained key')
        keys.set(version, secret)
        const match = /^v([1-9]\d*)$/.exec(version)
        if (match) {
          const number = Number(match[1])
          if (!Number.isSafeInteger(number)) throw new Error('Unsafe version number')
          highest = Math.max(highest, number)
        }
      }
      if (active && !keys.has(active)) throw new Error('Active key missing from map')
      if (this.ifMissing) {
        if (active) {
          this.logger.info('Existing Plaid cleanup keys and active version preserved.')
          return
        }
        if (keys.size) throw new Error('Key map exists without an active version')
      }
      const next = highest + 1
      if (!Number.isSafeInteger(next)) throw new Error('Version number overflow')
      const version = `v${next}`
      keys.set(version, randomBytes(32).toString('base64'))
      const json = JSON.stringify(Object.fromEntries(keys))
      const quote = ["'", '`', '"'].find((candidate) => !json.includes(candidate))
      if (!quote) throw new Error('Cannot encode retained keys safely')
      const assignment = `PLAID_CLEANUP_KEYS=${quote}${json}${quote}`
      // Check both parsers without process overrides so retained key text cannot
      // be silently changed by interpolation or environment-file syntax.
      const decoded = await new EnvParser(assignment, this.app.appRoot, { ignoreProcessEnv: true }).parse()
      if (parseEnv(assignment).PLAID_CLEANUP_KEYS !== json || decoded.PLAID_CLEANUP_KEYS !== json) throw new Error('Key encoding mismatch')
      editor.add('PLAID_CLEANUP_KEYS', `${quote}${json}${quote}`, true)
      editor.add('PLAID_CLEANUP_KEY_VERSION', version, true)
      await editor.save()
      this.logger.info(`Plaid cleanup key ${version} saved and selected in .env; all older keys retained.`)
      this.logger.info('Running processes still use their loaded configuration. Coordinate all producers and consumers before activating the new version; do not restart only one consumer.')
    } catch {
      // Parser errors may contain secrets. Never print the original exception.
      this.logger.error('Cannot rotate Plaid cleanup keys. Check .env permissions, valid key-map JSON, retained secrets (at least 32 characters), and that the active version exists in the map. No keys are printed; inspect .env privately before retrying a save failure.')
      this.exitCode = 1
    }
  }
}
