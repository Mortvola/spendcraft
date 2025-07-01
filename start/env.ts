/*
|--------------------------------------------------------------------------
| Validating Environment Variables
|--------------------------------------------------------------------------
|
| In this file we define the rules for validating environment variables.
| By performing validation we ensure that your application is running in
| a stable environment with correct configuration values.
|
| This file is read automatically by the framework during the boot lifecycle
| and hence do not rename or move this file to a different location.
|
*/
import { Env } from "@adonisjs/core/env"

export default await Env.create(new URL("../", import.meta.url), {
  HOST: Env.schema.string({ format: 'host' }),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  APP_NAME: Env.schema.string(),
  APP_URL: Env.schema.string(),
  CACHE_VIEWS: Env.schema.boolean(),
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),
  HASH_DRIVER: Env.schema.enum(['argon', 'bcrypt'] as const),
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PG_HOST: Env.schema.string({ format: 'host' }),
  PG_PORT: Env.schema.number(),
  PG_USER: Env.schema.string(),
  PG_PASSWORD: Env.schema.string.optional(),
  PG_DB_NAME: Env.schema.string(),
  SMTP_HOST: Env.schema.string({ format: 'host' }),
  SMTP_PORT: Env.schema.number(),
  SMTP_USERNAME: Env.schema.string(),
  SMTP_PASSWORD: Env.schema.string(),
  REDIS_CONNECTION: Env.schema.enum(['local'] as const),
  REDIS_HOST: Env.schema.string({ format: 'host' }),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.string.optional(),
  VAPID_PUBLIC_KEY: Env.schema.string(),
  VAPID_PRIVATE_KEY: Env.schema.string(),
  DRIVE_DISK: Env.schema.enum(['fs'] as const),
  BULLMQ_REDIS_HOST: Env.schema.string.optional(),
  BULLMQ_REDIS_PORT: Env.schema.number.optional(),
  ACCESS_TOKEN_EXPIRE: Env.schema.number(),
  REFRESH_TOKEN_EXPIRE: Env.schema.number(),
})
  
