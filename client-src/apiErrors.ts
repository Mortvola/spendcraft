import type { ApiError, ErrorProps } from '../common/ResponseTypes.js';

/** Adapt API errors for the existing form components. */
export function toFormErrors(errors: readonly ApiError[]): ErrorProps[] {
  return errors.map(error => ({
    field: error.field ?? '',
    message: error.message,
    rule: error.rule ?? error.code ?? '',
  }));
}
