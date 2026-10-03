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
    manager.persistScroll(id, 0); // same as initial
    expect(listener).not.toHaveBeenCalled();

    manager.persistScroll(id, 120);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(activeTab(manager.getSnapshot())?.viewState.scrollTop).toBe(120);
  });

  it("toggles mode, updates content, and marks saved", () => {
    const manager = new TabManager();
    manager.openDocument(doc("/a.md"));
    const id = manager.getSnapshot().tabs[0].id;

    manager.updateContent(id, "edited");
    expect(activeTab(manager.getSnapshot())?.document.content).toBe("edited");

    manager.toggleMode(id);
    expect(activeTab(manager.getSnapshot())?.viewState.mode).toBe("edit");

    manager.markSaved(id, "/a.md", "a.md");
    expect(activeTab(manager.getSnapshot())?.savedContent).toBe("edited");
  });

  it("stops notifying after a subscriber unsubscribes", () => {
    const manager = new TabManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    unsubscribe();
    manager.openDocument(doc("/a.md"));
    expect(listener).not.toHaveBeenCalled();
  });

  describe("tab groups", () => {
    it("creates an unnamed group with a fresh color and id", () => {
      const manager = new TabManager();
      manager.openDocument(doc("/a.md"));
      manager.openDocument(doc("/b.md"));
      const [a, b] = manager.getSnapshot().tabs;

      const first = manager.createGroup(a.id);
      const second = manager.createGroup(b.id);
      const { groups } = manager.getSnapshot();
      expect(first).not.toBe(second);
      expect(groups.map((g) => [g.name, g.color])).toEqual([["", "blue"], ["", "red"]]);
      expect(manager.createGroup("nope")).toBeNull();
    });

    it("counts only visible tabs for ⌘1–9", () => {
      const manager = new TabManager();
      ["/a.md", "/b.md", "/c.md"].forEach((p) => manager.openDocument(doc(p)));
      const [a, b] = manager.getSnapshot().tabs;
      const group = manager.createGroup(b.id) as string;
      manager.activateTab(a.id);
      manager.toggleGroupCollapsed(group);

      manager.activateIndex(1); // a, [b hidden], c
      expect(activeTab(manager.getSnapshot())?.document.path).toBe("/c.md");
    });

    it("restores groups from the session, mapping indexes to new ids", () => {
      const manager = new TabManager();
      manager.restore(
        [
          { document: doc("/a.md"), mode: "reader", scrollTop: 0, group: 0 },
          { document: doc("/b.md"), mode: "reader", scrollTop: 0, group: null },
          { document: doc("/c.md"), mode: "reader", scrollTop: 0, group: 0 },
        ],
        [
          { name: "PoliVEM", color: "blue", collapsed: true },
          { name: "Empty", color: "red", collapsed: false },
        ],
        1,
      );
      const ws = manager.getSnapshot();
      expect(ws.groups).toHaveLength(1); // "Empty" lost all its tabs
      expect(ws.groups[0]).toMatchObject({ name: "PoliVEM", collapsed: true });
      expect(ws.tabs.map((t) => t.document.path)).toEqual(["/a.md", "/c.md", "/b.md"]);
      expect(activeTab(ws)?.document.path).toBe("/b.md");
    });
  });
});
