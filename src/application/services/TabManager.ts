import type { Document } from "../../domain/entities/Document";
import type { Tab, TabId } from "../../domain/entities/Tab";
import { createTab } from "../../domain/entities/Tab";
import { createGroup, nextGroupColor, type GroupColor, type GroupId } from "../../domain/entities/TabGroup";
import * as W from "../../domain/entities/Workspace";
import type { Workspace } from "../../domain/entities/Workspace";
import type { EditorMode } from "../../domain/values/ViewState";

type Listener = () => void;

/**
 * Single source of truth for open tabs, tab groups and the active tab (DESIGN.md §3.4).
 * Holds the current Workspace, applies the pure domain operations, and notifies
 * subscribers (Observer) — exposed in a shape ready for React's useSyncExternalStore.
 */
export class TabManager {
  private workspace: Workspace = W.emptyWorkspace;
  private readonly listeners = new Set<Listener>();
  private counter = 0;
  private groupCounter = 0;

  /** Stable snapshot for useSyncExternalStore — same ref until something changes. */
  readonly getSnapshot = (): Workspace => this.workspace;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Open a document: focus an existing tab for the same path, else add a new one. */
  openDocument(document: Document): void {
    const existing = W.findTabByPath(this.workspace, document.path);
    if (existing) {
      this.commit(W.activateTab(this.workspace, existing.id));
      return;
    }
    this.commit(W.addTab(this.workspace, createTab(this.nextId(), document)));
  }

  closeTab(id: TabId): void {
    this.commit(W.closeTab(this.workspace, id));
  }

  activateTab(id: TabId): void {
    this.commit(W.activateTab(this.workspace, id));
  }

  /** Focus the next (+1) or previous (-1) tab, wrapping around. */
  focusSibling(delta: 1 | -1): void {
    const id = W.siblingTabId(this.workspace, delta);
    if (id) this.commit(W.activateTab(this.workspace, id));
  }

  /** Activate the n-th tab shown in the tab bar (tabs in collapsed groups don't count). */
  activateIndex(index: number): void {
    const tab = W.visibleTabs(this.workspace)[index];
    if (tab) this.commit(W.activateTab(this.workspace, tab.id));
  }

  /** Drop a dragged tab into a gap of the visible tab bar; may join or leave a group. */
  dropTab(id: TabId, gap: number): void {
    this.commit(W.dropTab(this.workspace, id, gap));
  }

  /** Put a tab in a new, unnamed group with the next free color. Returns the group's id. */
  createGroup(tabId: TabId): GroupId | null {
    if (!this.workspace.tabs.some((t) => t.id === tabId)) return null;
    const group = createGroup(this.nextGroupId(), "", nextGroupColor(this.workspace.groups));
    this.commit(W.groupTabsInto(this.workspace, [tabId], group));
    return group.id;
  }

  addToGroup(tabId: TabId, groupId: GroupId): void {
    this.commit(W.addToGroup(this.workspace, tabId, groupId));
  }

  removeFromGroup(tabId: TabId): void {
    this.commit(W.removeFromGroup(this.workspace, tabId));
  }

  renameGroup(groupId: GroupId, name: string): void {
    this.commit(W.updateGroup(this.workspace, groupId, { name }));
  }

  recolorGroup(groupId: GroupId, color: GroupColor): void {
    this.commit(W.updateGroup(this.workspace, groupId, { color }));
  }

  toggleGroupCollapsed(groupId: GroupId): void {
    const group = W.findGroup(this.workspace, groupId);
    if (group) this.commit(W.setGroupCollapsed(this.workspace, groupId, !group.collapsed));
  }

  ungroup(groupId: GroupId): void {
    this.commit(W.ungroup(this.workspace, groupId));
  }

  groupByFolder(): void {
    this.commit(W.groupByFolder(this.workspace, () => this.nextGroupId()));
  }

  /** Persist a tab's scroll position. Notifies only if it changed. */
  persistScroll(id: TabId, scrollTop: number): void {
    this.commit(W.setScrollTop(this.workspace, id, scrollTop));
  }

  setMode(id: TabId, mode: EditorMode): void {
    this.commit(W.setMode(this.workspace, id, mode));
  }

  toggleMode(id: TabId): void {
    const tab = this.workspace.tabs.find((t) => t.id === id);
    if (tab) this.commit(W.setMode(this.workspace, id, tab.viewState.mode === "edit" ? "reader" : "edit"));
  }

  updateContent(id: TabId, content: string): void {
    this.commit(W.updateContent(this.workspace, id, content));
  }

  markSaved(id: TabId, path: string, name: string): void {
    this.commit(W.markSaved(this.workspace, id, { path, name }));
  }

  reloadContent(id: TabId, content: string): void {
    this.commit(W.reloadContent(this.workspace, id, content));
  }

  /**
   * Bring the saved session back on launch, merged with anything already open. Each
   * entry's `group` indexes into `groups`; groups left without tabs are dropped.
   */
  restore(
    entries: ReadonlyArray<{
      document: Document;
      mode: EditorMode;
      scrollTop: number;
      group: number | null;
    }>,
    groups: ReadonlyArray<{ name: string; color: GroupColor; collapsed: boolean }>,
    activeIndex: number,
  ): void {
    const restoredGroups = groups.map((g) => ({
      ...createGroup(this.nextGroupId(), g.name, g.color),
      collapsed: g.collapsed,
    }));
    const tabs: Tab[] = entries.map((entry) => ({
      id: this.nextId(),
      document: entry.document,
      viewState: { mode: entry.mode, scrollTop: entry.scrollTop },
      savedContent: entry.document.content,
      revision: 0,
      groupId: entry.group === null ? null : (restoredGroups[entry.group]?.id ?? null),
    }));
    this.commit(W.mergeRestored(this.workspace, { tabs, groups: restoredGroups }, activeIndex));
  }

  private nextId(): TabId {
    this.counter += 1;
    return `tab-${this.counter}`;
  }

  private nextGroupId(): GroupId {
    this.groupCounter += 1;
    return `group-${this.groupCounter}`;
  }

  private commit(next: Workspace): void {
    if (next === this.workspace) return; // pure ops return same ref when unchanged
    this.workspace = next;
    this.listeners.forEach((listener) => listener());
  }
}
