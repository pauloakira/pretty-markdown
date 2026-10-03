import type { Session } from "../values/Session";
import type { EditorMode } from "../values/ViewState";
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

/** Save a tab's scroll position (preserving the rest of its view state). No-op if unchanged. */
export function setScrollTop(ws: Workspace, id: TabId, scrollTop: number): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.viewState.scrollTop === scrollTop) return ws;
  return {
    ...ws,
    tabs: ws.tabs.map((t) =>
      t.id === id ? { ...t, viewState: { ...t.viewState, scrollTop } } : t,
    ),
  };
}

/** Switch a tab between reader and edit mode. No-op if unchanged. */
export function setMode(ws: Workspace, id: TabId, mode: EditorMode): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.viewState.mode === mode) return ws;
  return {
    ...ws,
    tabs: ws.tabs.map((t) =>
      t.id === id ? { ...t, viewState: { ...t.viewState, mode } } : t,
    ),
  };
}

/** Update a tab's document content (an edit). No-op if unchanged. */
export function updateContent(ws: Workspace, id: TabId, content: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.document.content === content) return ws;
  const document = { ...tab.document, content };
  return {
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === id ? { ...t, document } : t)),
  };
}

/** Build a fresh workspace from restored tabs, activating the one at `activeIndex`. */
export function restoreWorkspace(tabs: readonly Tab[], activeIndex: number): Workspace {
  if (tabs.length === 0) return emptyWorkspace;
  const index = Math.min(Math.max(0, activeIndex), tabs.length - 1);
  return { tabs: [...tabs], activeTabId: tabs[index].id };
}

/**
 * Bring a restored session back into a workspace that may already have tabs — e.g. when
 * the app is launched by double-clicking a file, which can open before the session has
 * been read back.
 *
 * The restored tabs come first, in their saved order; tabs already open are appended
 * unless the session already has that file. The tab the user just opened stays active
 * (matched by path, so it points at the restored copy if the session had it). The result
 * is the same whichever finishes first, the file open or the restore.
 */
export function mergeRestored(
  ws: Workspace,
  restored: readonly Tab[],
  activeIndex: number,
): Workspace {
  if (ws.tabs.length === 0) return restoreWorkspace(restored, activeIndex);

  const restoredPaths = new Set(
    restored.map((t) => t.document.path).filter((p): p is string => p !== null),
  );
  const extra = ws.tabs.filter(
    (t) => t.document.path === null || !restoredPaths.has(t.document.path),
  );
  const tabs = [...restored, ...extra];

  const current = activeTab(ws);
  const active =
    current &&
    (tabs.find((t) => t.id === current.id) ??
      tabs.find((t) => t.document.path === current.document.path));
  return { tabs, activeTabId: active ? active.id : (tabs[0]?.id ?? null) };
}

/** Snapshot the open tabs (those backed by a file) into a persistable session. */
export function toSession(ws: Workspace): Session {
  const tabs = ws.tabs
    .filter((t): t is Tab & { document: { path: string } } => t.document.path !== null)
    .map((t) => ({
      path: t.document.path as string,
      mode: t.viewState.mode,
      scrollTop: t.viewState.scrollTop,
    }));
  const activeIndex = Math.max(
    0,
    ws.tabs.findIndex((t) => t.id === ws.activeTabId),
  );
  return { version: 1, activeIndex, tabs };
}

/** Reload a tab's content from disk: updates content, resets the dirty baseline, and
 * bumps the revision so the editor remounts. No-op if content already matches and clean. */
export function reloadContent(ws: Workspace, id: TabId, content: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab) return ws;
  if (tab.document.content === content && tab.savedContent === content) return ws;
  const document = { ...tab.document, content };
  return {
    ...ws,
    tabs: ws.tabs.map((t) =>
      t.id === id
        ? { ...t, document, savedContent: content, revision: t.revision + 1 }
        : t,
    ),
  };
}

/** Mark a tab as saved to `path`: updates the path/name and the dirty baseline. */
export function markSaved(
  ws: Workspace,
  id: TabId,
  saved: { path: string; name: string },
): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab) return ws;
  const document = { ...tab.document, path: saved.path, name: saved.name };
  return {
    ...ws,
    tabs: ws.tabs.map((t) =>
      t.id === id ? { ...t, document, savedContent: document.content } : t,
    ),
  };
}
