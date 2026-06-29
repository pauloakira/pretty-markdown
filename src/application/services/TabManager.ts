import type { Document } from "../../domain/entities/Document";
import type { Tab, TabId } from "../../domain/entities/Tab";
import { createTab } from "../../domain/entities/Tab";
import * as W from "../../domain/entities/Workspace";
import type { Workspace } from "../../domain/entities/Workspace";
import type { EditorMode } from "../../domain/values/ViewState";

type Listener = () => void;

/**
 * Single source of truth for open tabs and the active tab (DESIGN.md §3.4).
 * Holds the current Workspace, applies the pure domain operations, and notifies
 * subscribers (Observer) — exposed in a shape ready for React's useSyncExternalStore.
 */
export class TabManager {
  private workspace: Workspace = W.emptyWorkspace;
  private readonly listeners = new Set<Listener>();
  private counter = 0;

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

  activateIndex(index: number): void {
    const tab = this.workspace.tabs[index];
    if (tab) this.commit(W.activateTab(this.workspace, tab.id));
  }

  moveTab(id: TabId, toIndex: number): void {
    this.commit(W.moveTab(this.workspace, id, toIndex));
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

  /** Replace the whole workspace with restored tabs (used on launch). */
  restore(
    entries: ReadonlyArray<{ document: Document; mode: EditorMode; scrollTop: number }>,
    activeIndex: number,
  ): void {
    const tabs: Tab[] = entries.map((entry) => ({
      id: this.nextId(),
      document: entry.document,
      viewState: { mode: entry.mode, scrollTop: entry.scrollTop },
      savedContent: entry.document.content,
    }));
    this.commit(W.restoreWorkspace(tabs, activeIndex));
  }

  private nextId(): TabId {
    this.counter += 1;
    return `tab-${this.counter}`;
  }

  private commit(next: Workspace): void {
    if (next === this.workspace) return; // pure ops return same ref when unchanged
    this.workspace = next;
    this.listeners.forEach((listener) => listener());
  }
}
