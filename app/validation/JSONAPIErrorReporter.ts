import { errors } from '@vinejs/vine'
import {
   FieldContext,
   ErrorReporterContract
} from '@vinejs/vine/types'

export class JSONAPIErrorReporter implements ErrorReporterContract {
  /**
   * A flag to know if one or more errors have been
   * reported
   */
  hasErrors = false

  /**
   * A collection of errors. Feel free to give accurate types
   * to this property
   */
  errors: unknown[] = []

  /**
   * VineJS call the report method
   */
  report(
    message: string,
    rule: string,
    field: FieldContext,
    meta?: unknown
  ) {
    this.hasErrors = true

    /**
     * Collecting errors as per the JSONAPI spec
     */
    this.errors.push({
      code: rule,
      detail: message,
      source: {
        pointer: field.wildCardPath
      },
      ...(meta ? { meta } : {})
    })
  }

  /**
   * Creates and returns an instance of the
   * ValidationError class
   */
  createError() {
    return new errors.E_VALIDATION_ERROR(this.errors)
  }
}
