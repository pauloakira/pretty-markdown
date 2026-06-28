/**
 * A value representing success or failure. We model expected failures as values
 * (see ARCHITECTURE.md §4) instead of throwing, so call sites must handle both cases.
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
