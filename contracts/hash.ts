import { InferListFromConfig } from '@adonisjs/core/build/config'
import hashConfig from '../config/hash'

declare module '@ioc:Adonis/Core/Hash' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface HashersList extends InferListFromConfig<typeof hashConfig> {}
}
