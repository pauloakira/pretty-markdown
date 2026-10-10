import type { Session, SessionGroup } from "../values/Session";
import { normalizePdfView, type EditorMode, type PdfView } from "../values/ViewState";
import type { Tab, TabId } from "./Tab";
import { createGroup, nextGroupColor, type GroupColor, type GroupId, type TabGroup } from "./TabGroup";

/**
 * The set of open tabs, which one is active, and the tab groups. Modeled as immutable
 * state with pure operations (reducer style); the Application-layer TabManager holds the
 * current value and notifies subscribers. Operations return the same reference when
 * nothing changes, so consumers (e.g. useSyncExternalStore) can skip redundant work.
 *
 * Group invariants, restored by `normalize` after every grouping change:
 * - a group's tabs are adjacent in `tabs` (a group is one run in the tab bar);
 * - `groups` lists only groups that have tabs, in tab-bar order;
 * - the active tab is never hidden inside a collapsed group.
 */
export interface Workspace {
  readonly tabs: readonly Tab[];
  readonly activeTabId: TabId | null;
  readonly groups: readonly TabGroup[];
}

export const emptyWorkspace: Workspace = { tabs: [], activeTabId: null, groups: [] };

export function activeTab(ws: Workspace): Tab | null {
  return ws.tabs.find((t) => t.id === ws.activeTabId) ?? null;
}

export function findGroup(ws: Workspace, id: GroupId | null): TabGroup | null {
  if (id === null) return null;
  return ws.groups.find((g) => g.id === id) ?? null;
}

export function groupTabs(ws: Workspace, id: GroupId): Tab[] {
  return ws.tabs.filter((t) => t.groupId === id);
}

/** Whether a tab is folded away inside a collapsed group. */
export function isTabHidden(ws: Workspace, tab: Tab): boolean {
  return findGroup(ws, tab.groupId)?.collapsed ?? false;
}

/** Tabs shown in the tab bar — everything except the contents of collapsed groups. */
export function visibleTabs(ws: Workspace): Tab[] {
  return ws.tabs.filter((t) => !isTabHidden(ws, t));
}

/** Find an already-open tab for a path, so opening the same file focuses it instead of duplicating. */
export function findTabByPath(ws: Workspace, path: string | null): Tab | null {
  if (path === null) return null;
  return ws.tabs.find((t) => t.document.path === path) ?? null;
}

/**
 * Re-establish the group invariants (see `Workspace`): pull each group's tabs together
 * at its first tab, drop groups that have no tabs (and memberships of groups that no
 * longer exist), and expand the group holding the active tab.
 */
export function normalize(ws: Workspace): Workspace {
  const known = new Set(ws.groups.map((g) => g.id));
  const members = new Map<GroupId, Tab[]>();
  const loose: Tab[] = ws.tabs.map((t) =>
    t.groupId !== null && !known.has(t.groupId) ? { ...t, groupId: null } : t,
  );
  for (const t of loose) {
    if (t.groupId === null) continue;
    const list = members.get(t.groupId) ?? [];
    list.push(t);
    members.set(t.groupId, list);
  }

  const tabs: Tab[] = [];
  const order: GroupId[] = [];
  for (const t of loose) {
    if (t.groupId === null) {
      tabs.push(t);
    } else if (!order.includes(t.groupId)) {
      order.push(t.groupId);
      tabs.push(...(members.get(t.groupId) ?? []));
    }
  }

  const activeGroup = tabs.find((t) => t.id === ws.activeTabId)?.groupId ?? null;
  const groups = order.map((id) => {
    const g = ws.groups.find((x) => x.id === id) as TabGroup;
    return g.id === activeGroup && g.collapsed ? { ...g, collapsed: false } : g;
  });
  return { tabs, activeTabId: ws.activeTabId, groups };
}

/** Append a tab (ungrouped) and make it active. */
export function addTab(ws: Workspace, tab: Tab): Workspace {
  return normalize({ ...ws, tabs: [...ws.tabs, tab], activeTabId: tab.id });
}

/** Activate a tab, expanding its group if it was collapsed. */
export function activateTab(ws: Workspace, id: TabId): Workspace {
  if (ws.activeTabId === id || !ws.tabs.some((t) => t.id === id)) return ws;
  return normalize({ ...ws, activeTabId: id });
}

/**
 * The visible tab nearest to `index` in `tabs` — right first, then left — or null.
 * Used to pick a new active tab without landing inside a collapsed group.
 */
function nearestVisible(ws: Workspace, tabs: readonly Tab[], index: number): Tab | null {
  for (let i = index; i < tabs.length; i += 1) if (!isTabHidden(ws, tabs[i])) return tabs[i];
  for (let i = index - 1; i >= 0; i -= 1) if (!isTabHidden(ws, tabs[i])) return tabs[i];
  return null;
}

/** Remove a tab; if it was active, activate its nearest visible neighbor (right, then left). */
export function closeTab(ws: Workspace, id: TabId): Workspace {
  const index = ws.tabs.findIndex((t) => t.id === id);
  if (index === -1) return ws;

  const tabs = ws.tabs.filter((t) => t.id !== id);
  let activeTabId = ws.activeTabId;
  if (ws.activeTabId === id) {
    const neighbor = nearestVisible(ws, tabs, index) ?? tabs[index] ?? tabs[index - 1] ?? null;
    activeTabId = neighbor ? neighbor.id : null;
  }
  return normalize({ ...ws, tabs, activeTabId });
}

/** Id of the next/previous visible tab, wrapping around. Null if there are no tabs. */
export function siblingTabId(ws: Workspace, delta: 1 | -1): TabId | null {
  const tabs = visibleTabs(ws);
  if (tabs.length === 0 || ws.activeTabId === null) return null;
  const i = tabs.findIndex((t) => t.id === ws.activeTabId);
  const next = (i + delta + tabs.length) % tabs.length;
  return tabs[next].id;
}

/** Where a dragged tab lands: before which tab (null = at the end) and in which group. */
export interface DropTarget {
  readonly beforeId: TabId | null;
  readonly groupId: GroupId | null;
}

/**
 * Resolve dropping tab `id` into insertion gap `gap` of the visible tab bar (0 = before
 * the first visible tab, `visibleTabs(ws).length` = after the last).
 *
 * The group follows the neighbors: between two tabs of one group joins that group; next
 * to the tab's own group keeps it (so reordering at a group's edge doesn't eject it);
 * anywhere else leaves the tab ungrouped. `outside` marks a drop on empty tab-bar space
 * or on a group's chip rather than on a tab — that always leaves the tab ungrouped, so a
 * group at either end of the bar can still be dragged out of.
 */
export function resolveDrop(
  ws: Workspace,
  id: TabId,
  gap: number,
  outside = false,
): DropTarget | null {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab) return null;
  const visible = visibleTabs(ws);
  const from = visible.findIndex((t) => t.id === id);
  const others = visible.filter((t) => t.id !== id);
  // Gaps were counted with the dragged tab still in place.
  const at = Math.max(0, Math.min(from !== -1 && gap > from ? gap - 1 : gap, others.length));
  const left = others[at - 1] ?? null;
  const right = others[at] ?? null;

  let groupId: GroupId | null = null;
  if (outside) {
    groupId = null;
  } else if (left && right && left.groupId !== null && left.groupId === right.groupId) {
    groupId = left.groupId;
  } else if (
    tab.groupId !== null &&
    (left?.groupId === tab.groupId || right?.groupId === tab.groupId)
  ) {
    groupId = tab.groupId;
  }
  return { beforeId: right ? right.id : null, groupId };
}

/** Drop a dragged tab into a gap of the visible tab bar (see `resolveDrop`). */
export function dropTab(ws: Workspace, id: TabId, gap: number, outside = false): Workspace {
  const target = resolveDrop(ws, id, gap, outside);
  if (!target) return ws;
  const tab = ws.tabs.find((t) => t.id === id) as Tab;

  const rest = ws.tabs.filter((t) => t.id !== id);
  const moved = tab.groupId === target.groupId ? tab : { ...tab, groupId: target.groupId };
  const index = target.beforeId === null ? rest.length : rest.findIndex((t) => t.id === target.beforeId);
  const tabs = [...rest.slice(0, index), moved, ...rest.slice(index)];

  if (moved === tab && tabs.every((t, i) => t === ws.tabs[i])) return ws;
  return normalize({ ...ws, tabs });
}

/** A slot in the tab bar: an ungrouped tab, or a whole group (collapsed or not). */
export type TabUnit =
  | { readonly kind: "tab"; readonly tabId: TabId }
  | { readonly kind: "group"; readonly groupId: GroupId };

/** The tab bar as units, in order — what a dragged group can be placed between. */
export function tabUnits(ws: Workspace): TabUnit[] {
  const units: TabUnit[] = [];
  const seen = new Set<GroupId>();
  for (const t of ws.tabs) {
    if (t.groupId === null) {
      units.push({ kind: "tab", tabId: t.id });
    } else if (!seen.has(t.groupId)) {
      seen.add(t.groupId);
      units.push({ kind: "group", groupId: t.groupId });
    }
  }
  return units;
}

/**
 * Move a whole group (dragged by its chip) to just before unit `toUnit` of the *other*
 * units — `tabUnits` without this group — or to the end when `toUnit` is past the last.
 * Groups only land between units, never inside another group.
 */
export function moveGroup(ws: Workspace, id: GroupId, toUnit: number): Workspace {
  if (!findGroup(ws, id)) return ws;
  const members = ws.tabs.filter((t) => t.groupId === id);
  const rest = ws.tabs.filter((t) => t.groupId !== id);
  const others = tabUnits({ ...ws, tabs: rest });
  const target = others[Math.max(0, Math.min(toUnit, others.length))];
  const index =
    target === undefined
      ? rest.length
      : rest.findIndex((t) => (target.kind === "tab" ? t.id === target.tabId : t.groupId === target.groupId));
  const tabs = [...rest.slice(0, index), ...members, ...rest.slice(index)];

  if (tabs.every((t, i) => t === ws.tabs[i])) return ws;
  return normalize({ ...ws, tabs });
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

/** Switch a markdown tab between reader and edit mode. No-op if unchanged, or for a PDF. */
export function setMode(ws: Workspace, id: TabId, mode: EditorMode): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.document.kind !== "markdown" || tab.viewState.mode === mode) return ws;
  return {
    ...ws,
    tabs: ws.tabs.map((t) =>
      t.id === id ? { ...t, viewState: { ...t.viewState, mode } } : t,
    ),
  };
}

/** Save where a PDF tab is (page, offset, zoom), clamped into range. No-op if unchanged
 * or for a markdown tab. */
export function setPdfView(ws: Workspace, id: TabId, view: PdfView): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.document.kind !== "pdf") return ws;
  const next = normalizePdfView(view);
  const prev = tab.viewState.pdf;
  if (prev && prev.page === next.page && prev.pageOffset === next.pageOffset && prev.zoom === next.zoom) {
    return ws;
  }
  return {
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === id ? { ...t, viewState: { ...t.viewState, pdf: next } } : t)),
  };
}

/** Update a markdown tab's content (an edit). No-op if unchanged, or for a PDF. */
export function updateContent(ws: Workspace, id: TabId, content: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.document.kind !== "markdown" || tab.document.content === content) return ws;
  const document = { ...tab.document, content };
  return {
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === id ? { ...t, document } : t)),
  };
}

// ---- Tab groups -------------------------------------------------------------

/**
 * Put tabs into a new group, gathered at the position of the leftmost one (they leave
 * any group they were in). Tabs that aren't open are ignored.
 */
export function groupTabsInto(ws: Workspace, ids: readonly TabId[], group: TabGroup): Workspace {
  const wanted = new Set(ids);
  const first = ws.tabs.findIndex((t) => wanted.has(t.id));
  if (first === -1 || findGroup(ws, group.id)) return ws;

  const picked = ws.tabs.filter((t) => wanted.has(t.id)).map((t) => ({ ...t, groupId: group.id }));
  const before = ws.tabs.slice(0, first).filter((t) => !wanted.has(t.id));
  const after = ws.tabs.slice(first).filter((t) => !wanted.has(t.id));
  return normalize({
    ...ws,
    tabs: [...before, ...picked, ...after],
    groups: [...ws.groups, group],
  });
}

/** Move a tab to the end of an existing group. */
export function addToGroup(ws: Workspace, id: TabId, groupId: GroupId): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.groupId === groupId || !findGroup(ws, groupId)) return ws;

  const rest = ws.tabs.filter((t) => t.id !== id);
  let last = -1;
  rest.forEach((t, i) => {
    if (t.groupId === groupId) last = i;
  });
  const tabs = [...rest.slice(0, last + 1), { ...tab, groupId }, ...rest.slice(last + 1)];
  return normalize({ ...ws, tabs });
}

/** Take a tab out of its group, placing it just after the group (as Chrome does). */
export function removeFromGroup(ws: Workspace, id: TabId): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.groupId === null) return ws;

  const rest = ws.tabs.filter((t) => t.id !== id);
  let last = rest.findIndex((t) => t.groupId === tab.groupId);
  if (last === -1) {
    last = ws.tabs.findIndex((t) => t.id === id) - 1; // it was the only member
  } else {
    while (last + 1 < rest.length && rest[last + 1].groupId === tab.groupId) last += 1;
  }
  const tabs = [...rest.slice(0, last + 1), { ...tab, groupId: null }, ...rest.slice(last + 1)];
  return normalize({ ...ws, tabs });
}

/** Rename and/or recolor a group. No-op if nothing changes. */
export function updateGroup(
  ws: Workspace,
  id: GroupId,
  patch: { readonly name?: string; readonly color?: GroupColor },
): Workspace {
  const group = findGroup(ws, id);
  if (!group) return ws;
  const name = patch.name ?? group.name;
  const color = patch.color ?? group.color;
  if (name === group.name && color === group.color) return ws;
  return { ...ws, groups: ws.groups.map((g) => (g.id === id ? { ...g, name, color } : g)) };
}

/**
 * Collapse or expand a group. Collapsing the group that holds the active tab first moves
 * focus to the nearest visible tab outside it; if there is none, the group stays open.
 */
export function setGroupCollapsed(ws: Workspace, id: GroupId, collapsed: boolean): Workspace {
  const group = findGroup(ws, id);
  if (!group || group.collapsed === collapsed) return ws;

  const next: Workspace = {
    ...ws,
    groups: ws.groups.map((g) => (g.id === id ? { ...g, collapsed } : g)),
  };
  const active = activeTab(ws);
  if (!collapsed || active?.groupId !== id) return next;

  const index = ws.tabs.findIndex((t) => t.id === active.id);
  const neighbor = nearestVisible(next, ws.tabs, index);
  if (!neighbor) return ws;
  return { ...next, activeTabId: neighbor.id };
}

/** Dissolve a group, leaving its tabs where they are. */
export function ungroup(ws: Workspace, id: GroupId): Workspace {
  if (!findGroup(ws, id)) return ws;
  return normalize({
    ...ws,
    tabs: ws.tabs.map((t) => (t.groupId === id ? { ...t, groupId: null } : t)),
    groups: ws.groups.filter((g) => g.id !== id),
  });
}

/** The folder part of a path (handles both `/` and `\` separators). */
function folderOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
}

/**
 * Name a folder by its nearest segment that tells it apart from the other `folders`, so
 * `…/paper_a/docs` and `…/paper_b/docs` become "paper_a" and "paper_b" rather than two
 * groups both called "docs".
 */
export function folderLabel(folder: string, folders: readonly string[]): string {
  const segments = (f: string) => f.split(/[/\\]/).filter(Boolean);
  const own = segments(folder);
  const others = [...new Set(folders)].filter((f) => f !== folder).map(segments);
  for (let depth = 1; depth <= own.length; depth += 1) {
    const suffix = own.slice(-depth).join("/");
    if (!others.some((o) => o.slice(-depth).join("/") === suffix)) return own[own.length - depth];
  }
  return own[own.length - 1] ?? folder;
}

/**
 * Group ungrouped tabs by the folder their file lives in. A tab joins an existing group
 * whose tabs all come from its folder; otherwise two or more tabs from one folder form a
 * new group named after it (see `folderLabel`). Tabs already in a group, and untitled
 * tabs, are left alone.
 */
export function groupByFolder(ws: Workspace, newGroupId: () => GroupId): Workspace {
  const folderGroups = new Map<string, GroupId>();
  for (const g of ws.groups) {
    const folders = new Set(groupTabs(ws, g.id).map((t) => (t.document.path === null ? null : folderOf(t.document.path))));
    const [only] = folders;
    if (folders.size === 1 && typeof only === "string" && !folderGroups.has(only)) {
      folderGroups.set(only, g.id);
    }
  }

  const buckets = new Map<string, TabId[]>();
  for (const t of ws.tabs) {
    if (t.groupId !== null || t.document.path === null) continue;
    const folder = folderOf(t.document.path);
    buckets.set(folder, [...(buckets.get(folder) ?? []), t.id]);
  }

  const allFolders = ws.tabs
    .map((t) => t.document.path)
    .filter((p): p is string => p !== null)
    .map(folderOf);
  let next = ws;
  for (const [folder, ids] of buckets) {
    const existing = folderGroups.get(folder);
    if (existing) {
      for (const id of ids) next = addToGroup(next, id, existing);
    } else if (ids.length >= 2) {
      const group = createGroup(newGroupId(), folderLabel(folder, allFolders), nextGroupColor(next.groups));
      next = groupTabsInto(next, ids, group);
    }
  }
  return next;
}

// ---- Session ----------------------------------------------------------------

/** Build a fresh workspace from restored tabs and groups, activating the tab at `activeIndex`. */
export function restoreWorkspace(
  tabs: readonly Tab[],
  groups: readonly TabGroup[],
  activeIndex: number,
): Workspace {
  if (tabs.length === 0) return emptyWorkspace;
  const index = Math.min(Math.max(0, activeIndex), tabs.length - 1);
  return normalize({ tabs: [...tabs], activeTabId: tabs[index].id, groups: [...groups] });
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
  restored: { readonly tabs: readonly Tab[]; readonly groups: readonly TabGroup[] },
  activeIndex: number,
): Workspace {
  if (ws.tabs.length === 0) return restoreWorkspace(restored.tabs, restored.groups, activeIndex);

  const restoredPaths = new Set(
    restored.tabs.map((t) => t.document.path).filter((p): p is string => p !== null),
  );
  const extra = ws.tabs.filter(
    (t) => t.document.path === null || !restoredPaths.has(t.document.path),
  );
  const tabs = [...restored.tabs, ...extra];

  const current = activeTab(ws);
  const active =
    current &&
    (tabs.find((t) => t.id === current.id) ??
      tabs.find((t) => t.document.path === current.document.path));
  return normalize({
    tabs,
    activeTabId: active ? active.id : (tabs[0]?.id ?? null),
    groups: [...restored.groups, ...ws.groups],
  });
}

/** Snapshot the open tabs (those backed by a file) and their groups into a persistable session. */
export function toSession(ws: Workspace): Session {
  const saved = ws.tabs.filter((t) => t.document.path !== null);

  const groups: SessionGroup[] = [];
  const slot = new Map<GroupId, number>();
  for (const t of saved) {
    const group = findGroup(ws, t.groupId);
    if (group && !slot.has(group.id)) {
      slot.set(group.id, groups.length);
      groups.push({ name: group.name, color: group.color, collapsed: group.collapsed });
    }
  }

  const tabs = saved.map((t) => {
    const pdf = t.document.kind === "pdf" ? t.viewState.pdf : undefined;
    return {
      path: t.document.path as string,
      mode: t.viewState.mode,
      scrollTop: t.viewState.scrollTop,
      group: t.groupId === null ? null : (slot.get(t.groupId) ?? null),
      ...(pdf ? { pdf } : {}),
    };
  });
  const activeIndex = Math.max(
    0,
    saved.findIndex((t) => t.id === ws.activeTabId),
  );
  return { version: 3, activeIndex, tabs, groups };
}

/** Reload a markdown tab's content from disk: updates content, resets the dirty baseline,
 * and bumps the revision so the editor remounts. No-op if content already matches and
 * clean, or for a PDF. */
export function reloadContent(ws: Workspace, id: TabId, content: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.document.kind !== "markdown") return ws;
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

/** Reload a PDF tab from disk (the file changed): bumps the revision so the viewer
 * remounts and reads the file again, keeping the tab's position. No-op for markdown. */
export function reloadPdf(ws: Workspace, id: TabId): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.document.kind !== "pdf") return ws;
  return { ...ws, tabs: ws.tabs.map((t) => (t.id === id ? { ...t, revision: t.revision + 1 } : t)) };
}

/** Mark a markdown tab as saved to `path`: updates the path/name and the dirty baseline.
 * No-op for a PDF (PDFs are never written). */
export function markSaved(
  ws: Workspace,
  id: TabId,
  saved: { path: string; name: string },
): Workspace {
  const tab = ws.tabs.find((t) => t.id === id);
  if (!tab || tab.document.kind !== "markdown") return ws;
  const document = { ...tab.document, path: saved.path, name: saved.name };
  return {
    ...ws,
    tabs: ws.tabs.map((t) =>
      t.id === id ? { ...t, document, savedContent: document.content } : t,
    ),
  };
}
