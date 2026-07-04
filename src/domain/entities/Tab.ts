import { initialViewState, type ViewState } from "../values/ViewState";
import type { Document } from "./Document";

export type TabId = string;

/**
 * One open document in the workspace. Each tab owns its own document and view state,
 * so tabs are fully isolated (see DESIGN.md §3.4). Immutable.
 *
 * `savedContent` is the content as last persisted to disk; comparing it to the current
 * document content tells us whether the tab has unsaved edits.
 */
export interface Tab {
  readonly id: TabId;
  readonly document: Document;
  readonly viewState: ViewState;
  readonly savedContent: string;
  /** Bumped when content is reloaded from disk, to force the editor to remount. */
  readonly revision: number;
}

export function createTab(id: TabId, document: Document): Tab {
  return {
    id,
    document,
    viewState: initialViewState,
    savedContent: document.content,
    revision: 0,
  };
}

/** Whether the tab has edits not yet written to disk. */
export function isTabDirty(tab: Tab): boolean {
  return tab.document.content !== tab.savedContent;
}
