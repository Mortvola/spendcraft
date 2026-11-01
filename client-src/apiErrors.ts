import type { ApiError, ErrorProps } from '../common/ResponseTypes.js';

/** Adapt native validation and legacy API errors for the existing form components. */
export function toFormErrors(errors: readonly ApiError[]): ErrorProps[] {
  return errors.map(error => ({
    field: error.field ?? error.source?.pointer ?? '',
    message: error.message ?? error.detail ?? '',
    rule: error.rule ?? error.code ?? '',
  }));
}
