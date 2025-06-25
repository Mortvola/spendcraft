import env from '#start/env'
import { defineConfig } from '@adonisjs/core/logger'

/*
|--------------------------------------------------------------------------
| Logger
|--------------------------------------------------------------------------
*/
const loggerConfig = defineConfig({
  default: 'app',

  loggers: {
    app: {
      /*
      |--------------------------------------------------------------------------
      | Toggle logger
      |--------------------------------------------------------------------------
      |
      | Enable or disable logger application wide
      |
      */
      enabled: true,

      /*
      |--------------------------------------------------------------------------
      | Application name
      |--------------------------------------------------------------------------
      |
      | The name of the application you want to add to the log. It is recommended
      | to always have app name in every log line.
      |
      | The `APP_NAME` environment variable is automatically set by AdonisJS by
      | reading the `name` property from the `package.json` file.
      |
      */
      name: env.get('APP_NAME'),

      /*
      |--------------------------------------------------------------------------
      | Logging level
      |--------------------------------------------------------------------------
      |
      | The level from which you want the logger to flush logs. It is recommended
      | to make use of the environment variable, so that you can define log levels
      | at deployment level and not code level.
      |
      */
      level: env.get('LOG_LEVEL', 'info'),
    }
  }
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
