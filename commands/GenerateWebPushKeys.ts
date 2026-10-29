import webpush from 'web-push'
import { EnvEditor } from '@adonisjs/env/editor'
import { parseEnv } from 'node:util'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class GenerateWebPushKeys extends BaseCommand {
  public static commandName = 'generate:web-push-keys'
  public static description = 'Save a VAPID key pair to .env only when neither key is configured'

  static options: CommandOptions = {
    startApp: false,
    staysAlive: false,
  }

  public async run() {
    const editor = await EnvEditor.create(this.app.appRoot)
    const file = editor.toJSON().find((entry) => entry.path.endsWith('/.env'))
    if (!file) throw new Error('Cannot find .env; no VAPID keys were changed.')
    const env = parseEnv(file.contents.join('\n'))
    const hasPublicKey = Boolean(env.VAPID_PUBLIC_KEY)
    const hasPrivateKey = Boolean(env.VAPID_PRIVATE_KEY)
    if (hasPublicKey && hasPrivateKey) {
      this.logger.info('Existing VAPID keys preserved.')
      return
    }
    if (hasPublicKey || hasPrivateKey) {
      this.logger.error(
        'Only one VAPID key is configured. Restore the matching pair; no keys were changed.')
      this.exitCode = 1
      return
    }

    const keys = webpush.generateVAPIDKeys()
    editor.add('VAPID_PUBLIC_KEY', keys.publicKey, true)
    editor.add('VAPID_PRIVATE_KEY', keys.privateKey, true)
    await editor.save()
    this.logger.info('VAPID keys saved to .env.')
  }
}
