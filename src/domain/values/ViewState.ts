/** Reading vs. editing for a tab. */
export type EditorMode = "reader" | "edit";

/**
 * Per-tab view state — the bits of "where the reader was" that survive tab switches.
 * Scroll position and the current mode; the editor adds cursor/selection later.
 */
export interface ViewState {
  readonly scrollTop: number;
  readonly mode: EditorMode;
}

export const initialViewState: ViewState = { scrollTop: 0, mode: "reader" };
