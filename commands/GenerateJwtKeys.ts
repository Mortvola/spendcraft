import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { EnvEditor } from '@adonisjs/env/editor'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv, promisify } from 'node:util'
import { createPrivateKey, createPublicKey } from 'node:crypto'

const execute = promisify(execFile)

export default class GenerateJwtKeys extends BaseCommand {
  public static commandName = 'generate:jwt-keys'
  public static description = 'Save an ssh-keygen RSA JWT key pair to .env only when neither key is configured'

  static options: CommandOptions = {
    startApp: false,
    staysAlive: false,
  }

  public async run() {
    const editor = await EnvEditor.create(this.app.appRoot)
    const file = editor.toJSON().find((entry) => entry.path.endsWith('/.env'))
    if (!file) throw new Error('Cannot find .env; no JWT keys were changed.')
    const env = parseEnv(file.contents.join('\n'))
    if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
      this.logger.info('Existing JWT keys preserved.')
      return
    }
    if (env.JWT_PRIVATE_KEY || env.JWT_PUBLIC_KEY) {
      this.logger.error('Only one JWT key is configured. Restore the matching pair; no keys were changed.')
      this.exitCode = 1
      return
    }

    const directory = await mkdtemp(join(tmpdir(), 'spendcraft-jwt-'))
    try {
      const path = join(directory, 'jwt')
      await execute('ssh-keygen', ['-q', '-t', 'rsa', '-b', '3072', '-m', 'PEM', '-N', '', '-f', path])
      const { stdout } = await execute('ssh-keygen', ['-e', '-m', 'PKCS8', '-f', `${path}.pub`])
      const privatePem = (await readFile(path, 'utf8')).trim()
      const publicPem = stdout.trim()
      const privateKey = createPrivateKey(privatePem)
      const publicKey = createPublicKey(publicPem)
      if (privateKey.asymmetricKeyType !== 'rsa'
        || !createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(publicKey.export({ type: 'spki', format: 'der' }))) {
        throw new Error('Generated JWT keys do not form an RSA pair')
      }
      // Quoted multiline PEM is parsed as real newlines by Node and Adonis.
      // It is directly usable by the existing JWT guard's createPrivateKey.
      editor.add('JWT_PRIVATE_KEY', `"${privatePem}"`, true)
      editor.add('JWT_PUBLIC_KEY', `"${publicPem}"`, true)
      await editor.save()
      this.logger.info('JWT keys saved to .env.')
    } catch {
      this.logger.error('Cannot generate or save JWT keys. Check ssh-keygen availability, temporary storage and .env permissions; installation must stop.')
      this.exitCode = 1
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
