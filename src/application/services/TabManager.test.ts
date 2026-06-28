import { describe, expect, it, vi } from "vitest";
import { createDocument, type Document } from "../../domain/entities/Document";
import { activeTab } from "../../domain/entities/Workspace";
import { TabManager } from "./TabManager";

const doc = (path: string): Document => createDocument(path, `# ${path}`);

describe("TabManager", () => {
  it("opens a document into a new active tab and notifies subscribers", () => {
    const manager = new TabManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.openDocument(doc("/a.md"));

    const ws = manager.getSnapshot();
    expect(ws.tabs).toHaveLength(1);
    expect(activeTab(ws)?.document.path).toBe("/a.md");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("focuses the existing tab when reopening the same path (no duplicate)", () => {
    const manager = new TabManager();
    manager.openDocument(doc("/a.md"));
    manager.openDocument(doc("/b.md"));
    manager.openDocument(doc("/a.md")); // reopen first

    const ws = manager.getSnapshot();
    expect(ws.tabs).toHaveLength(2);
    expect(activeTab(ws)?.document.path).toBe("/a.md");
  });

  it("assigns unique ids to distinct documents", () => {
    const manager = new TabManager();
    manager.openDocument(doc("/a.md"));
    manager.openDocument(doc("/b.md"));
    const ids = manager.getSnapshot().tabs.map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("focusSibling cycles the active tab", () => {
    const manager = new TabManager();
    manager.openDocument(doc("/a.md"));
    manager.openDocument(doc("/b.md"));
    manager.focusSibling(1); // wraps from b → a
    expect(activeTab(manager.getSnapshot())?.document.path).toBe("/a.md");
  });

  it("does not notify when persisting an unchanged scroll position", () => {
    const manager = new TabManager();
    manager.openDocument(doc("/a.md"));
    const id = manager.getSnapshot().tabs[0].id;

    const listener = vi.fn();
    manager.subscribe(listener);
    manager.persistViewState(id, { scrollTop: 0 }); // same as initial
    expect(listener).not.toHaveBeenCalled();

    manager.persistViewState(id, { scrollTop: 120 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(activeTab(manager.getSnapshot())?.viewState.scrollTop).toBe(120);
  });

  it("stops notifying after a subscriber unsubscribes", () => {
    const manager = new TabManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    unsubscribe();
    manager.openDocument(doc("/a.md"));
    expect(listener).not.toHaveBeenCalled();
  });
});
