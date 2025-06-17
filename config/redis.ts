/**
 * Config source: https://git.io/JemcF
 *
 * Feel free to let us know via PR, if you find something broken in this config
 * file.
 */

import env from '#start/env'
import { defineConfig } from '@adonisjs/redis'

/*
|--------------------------------------------------------------------------
| Redis configuration
|--------------------------------------------------------------------------
|
| Following is the configuration used by the Redis provider to connect to
| the redis server and execute redis commands.
|
| Do make sure to pre-define the connections type inside `contracts/redis.ts`
| file for AdonisJs to recognize connections.
|
| Make sure to check `contracts/redis.ts` file for defining extra connections
*/
const redisConfig = defineConfig({
  connection: env.get('REDIS_CONNECTION'),

  connections: {
    /*
    |--------------------------------------------------------------------------
    | The default connection
    |--------------------------------------------------------------------------
    |
    | The main connection you want to use to execute redis commands. The same
    | connection will be used by the session provider, if you rely on the
    | redis driver.
    |
    */
    local: {
      host: env.get('REDIS_HOST'),
      port: env.get('REDIS_PORT'),
      password: env.get('REDIS_PASSWORD', ''),
      db: 0,
      keyPrefix: '',
      retryStrategy(times) {
        return times > 10 ? null : times * 50
      },
    },
  },
})

export default redisConfig

declare module '@adonisjs/redis/types' {
  export interface RedisConnections extends InferConnections<typeof redisConfig> {}
}
