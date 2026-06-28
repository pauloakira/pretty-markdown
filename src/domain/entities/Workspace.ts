import type { ViewState } from "../values/ViewState";
import type { Tab, TabId } from "./Tab";

/**
 * The set of open tabs and which one is active. Modeled as immutable state with pure
 * operations (reducer style); the Application-layer TabManager holds the current value
 * and notifies subscribers. Operations return the same reference when nothing changes,
 * so consumers (e.g. useSyncExternalStore) can skip redundant work.
 */
export interface Workspace {
  readonly tabs: readonly Tab[];
  readonly activeTabId: TabId | null;
}

export const emptyWorkspace: Workspace = { tabs: [], activeTabId: null };

export function activeTab(ws: Workspace): Tab | null {
  return ws.tabs.find((t) => t.id === ws.activeTabId) ?? null;
}

/** Find an already-open tab for a path, so opening the same file focuses it instead of duplicating. */
export function findTabByPath(ws: Workspace, path: string | null): Tab | null {
  if (path === null) return null;
  return ws.tabs.find((t) => t.document.path === path) ?? null;
}

/** Append a tab and make it active. */
export function addTab(ws: Workspace, tab: Tab): Workspace {
  return { tabs: [...ws.tabs, tab], activeTabId: tab.id };
}

export function activateTab(ws: Workspace, id: TabId): Workspace {
  if (ws.activeTabId === id || !ws.tabs.some((t) => t.id === id)) return ws;
  return { ...ws, activeTabId: id };
}

/** Remove a tab; if it was active, activate its right neighbor (or left, or none). */
export function closeTab(ws: Workspace, id: TabId): Workspace {
  const index = ws.tabs.findIndex((t) => t.id === id);
  if (index === -1) return ws;

  const tabs = ws.tabs.filter((t) => t.id !== id);
  let activeTabId = ws.activeTabId;
  if (ws.activeTabId === id) {
    const neighbor = tabs[index] ?? tabs[index - 1] ?? null;
    activeTabId = neighbor ? neighbor.id : null;
  }
  return { tabs, activeTabId };
}

/** Id of the next/previous tab, wrapping around. Null if there are no tabs. */
export function siblingTabId(ws: Workspace, delta: 1 | -1): TabId | null {
  if (ws.tabs.length === 0 || ws.activeTabId === null) return null;
  const i = ws.tabs.findIndex((t) => t.id === ws.activeTabId);
  const next = (i + delta + ws.tabs.length) % ws.tabs.length;
  return ws.tabs[next].id;
}

/** Move a tab to a new index (drag-to-reorder). */
export function moveTab(ws: Workspace, id: TabId, toIndex: number): Workspace {
  const from = ws.tabs.findIndex((t) => t.id === id);
  if (from === -1) return ws;
  const clamped = Math.max(0, Math.min(toIndex, ws.tabs.length - 1));
  if (from === clamped) return ws;

  const tabs = [...ws.tabs];
  const [moved] = tabs.splice(from, 1);
  tabs.splice(clamped, 0, moved);
  return { ...ws, tabs };
}

/** Replace a tab's view state (e.g. saved scroll position). No-op if unchanged. */
export function setViewState(ws: Workspace, id: TabId, viewState: ViewState): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.viewState.scrollTop === viewState.scrollTop) return ws;
  return {
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === id ? { ...t, viewState } : t)),
  };
}
