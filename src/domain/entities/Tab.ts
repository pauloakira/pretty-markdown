import { initialViewState, type ViewState } from "../values/ViewState";
import type { Document } from "./Document";

export type TabId = string;

/**
 * One open document in the workspace. Each tab owns its own document and view state,
 * so tabs are fully isolated (see DESIGN.md §3.4). Immutable.
 */
export interface Tab {
  readonly id: TabId;
  readonly document: Document;
  readonly viewState: ViewState;
}

export function createTab(id: TabId, document: Document): Tab {
  return { id, document, viewState: initialViewState };
}
