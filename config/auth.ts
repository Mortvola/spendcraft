/**
 * Config source: https://git.io/JY0mp
 *
 * Feel free to let us know via PR, if you find something broken in this config
 * file.
 */

import { defineConfig } from '@adonisjs/auth';
import env from "#start/env";
import { sessionUserProvider } from '@adonisjs/auth/session';
import { Authenticators, InferAuthEvents } from '@adonisjs/auth/types';
import { JwtGuard } from '#app/auth/guards/JwtGuard';

/*
|--------------------------------------------------------------------------
| Authentication Mapping
|--------------------------------------------------------------------------
|
| List of available authentication mapping. You must first define them
| inside the `contracts/auth.ts` file before mentioning them here.
|
*/
const authConfig = defineConfig({
    default: 'jwt',
    guards: {
        /*
        |--------------------------------------------------------------------------
        | OAT Guard
        |--------------------------------------------------------------------------
        |
        | OAT (Opaque access tokens) guard uses database backed tokens to authenticate
        | HTTP request. This guard DOES NOT rely on sessions or cookies and uses
        | Authorization header value for authentication.
        |
        | Use this guard to authenticate mobile apps or web clients that cannot rely
        | on cookies/sessions.
        |
        */
        // api: {
        //     driver: 'oat',

        //     /*
        //     |--------------------------------------------------------------------------
        //     | Redis provider for managing tokens
        //     |--------------------------------------------------------------------------
        //     |
        //     | Uses Redis for managing tokens. We recommend using the "redis" driver
        //     | over the "database" driver when the tokens based auth is the
        //     | primary authentication mode.
        //     |
        //     | Redis ensure that all the expired tokens gets cleaned up automatically.
        //     | Whereas with SQL, you have to cleanup expired tokens manually.
        //     |
        //     | The foreignKey column is used to make the relationship between the user
        //     | and the token. You are free to use any column name here.
        //     |
        //     */
        //     tokenProvider: {
        //         type: 'api',
        //         driver: 'redis',
        //         redisConnection: 'local',
        //         foreignKey: 'user_id',
        //     },

        //     provider: {
        //         /*
        //         |--------------------------------------------------------------------------
        //         | Driver
        //         |--------------------------------------------------------------------------
        //         |
        //         | Name of the driver
        //         |
        //         */
        //         driver: 'lucid',

        //         /*
        //         |--------------------------------------------------------------------------
        //         | Identifier key
        //         |--------------------------------------------------------------------------
        //         |
        //         | The identifier key is the unique key on the model. In most cases specifying
        //         | the primary key is the right choice.
        //         |
        //         */
        //         identifierKey: 'id',

        //         /*
        //         |--------------------------------------------------------------------------
        //         | Uids
        //         |--------------------------------------------------------------------------
        //         |
        //         | Uids are used to search a user against one of the mentioned columns. During
        //         | login, the auth module will search the user mentioned value against one
        //         | of the mentioned columns to find their user record.
        //         |
        //         */
        //         uids: ['username'],

        //         /*
        //         |--------------------------------------------------------------------------
        //         | Model
        //         |--------------------------------------------------------------------------
        //         |
        //         | The model to use for fetching or finding users. The model is imported
        //         | lazily since the config files are read way earlier in the lifecycle
        //         | of booting the app and the models may not be in a usable state at
        //         | that time.
        //         |
        //         */
        //         model: () => import('#app/Models/User'),
        //     },
        // },

        jwt: (ctx) => {
          return new JwtGuard(
            ctx,
            sessionUserProvider({
              model: () => import('#models/User')
            }),
            {
              publicKey: env.get('JWT_PUBLIC_KEY', '').replace(/\\n/g, '\n'),
              privateKey: env.get('JWT_PRIVATE_KEY', '').replace(/\\n/g, '\n'),
              issuer: 'spendcraft',
              audience: 'spendcraft',
              jwtDefaultExpire: { minutes: env.get('ACCESS_TOKEN_EXPIRE') },
              refreshTokenDefaultExpire: { minutes: env.get('REFRESH_TOKEN_EXPIRE') },
            },
          )
        },
          // tokensGuard({
          //   provider: tokensUserProvider({
          //       tokens: 'accessTokens',
          //       model: () => import('#models/User'),
          //   }),
            // publicKey: env.get('JWT_PUBLIC_KEY', '').replace(/\\n/g, '\n'),
            // privateKey: env.get('JWT_PRIVATE_KEY', '').replace(/\\n/g, '\n'),
            // persistJwt: false,
            // jwtDefaultExpire: '1m',
            // refreshTokenDefaultExpire: '1d',
            // tokenProvider: {
            //     type: 'jwt',
            //     driver: 'redis',
            //     redisConnection: 'local',
            //     foreignKey: 'user_id'
            // },
            // provider: {
            //     driver: "lucid",
            //     identifierKey: "id",
            //     uids: ['username'],
            //     model: () => import('#app/Models/User')
            // }
    },
})

export default authConfig

/**
 * Inferring types from the configured auth
 * guards.
 */
declare module '@adonisjs/auth/types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}

declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
