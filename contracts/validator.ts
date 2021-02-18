declare module '@ioc:Adonis/Core/Validator' {
  import { Rule } from '@ioc:Adonis/Core/Validator'

  export interface Rules {
    empty (options: { table: string, column: string }): Rule,
    zeroSum (options: { property: string }): Rule,
  }
}
