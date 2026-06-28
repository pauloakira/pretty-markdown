/**
 * Per-tab view state — the bits of "where the reader was" that survive tab switches.
 * Kept minimal for M3 (scroll only); the editor milestone adds mode, cursor, font size.
 */
export interface ViewState {
  readonly scrollTop: number;
}

export const initialViewState: ViewState = { scrollTop: 0 };
