import { describe, expect, it } from "vitest";
import { createMarkdownDocument, createPdfDocument } from "./Document";
import { createTab, type Tab } from "./Tab";
import * as W from "./Workspace";

function tab(id: string, path: string): Tab {
  return createTab(id, createMarkdownDocument(path, `# ${id}`));
}

function workspaceOf(...tabs: Tab[]): W.Workspace {
  return tabs.reduce<W.Workspace>((ws, t) => W.addTab(ws, t), W.emptyWorkspace);
}

describe("Workspace", () => {
  it("adds a tab and makes it active", () => {
    const ws = W.addTab(W.emptyWorkspace, tab("a", "/a.md"));
    expect(ws.tabs).toHaveLength(1);
    expect(ws.activeTabId).toBe("a");
    expect(W.activeTab(ws)?.id).toBe("a");
  });

  it("finds an open tab by path (for dedupe)", () => {
    const ws = workspaceOf(tab("a", "/a.md"), tab("b", "/b.md"));
    expect(W.findTabByPath(ws, "/b.md")?.id).toBe("b");
    expect(W.findTabByPath(ws, "/missing.md")).toBeNull();
    expect(W.findTabByPath(ws, null)).toBeNull();
  });

  it("activates the right neighbor when the active tab is closed", () => {
    const ws = workspaceOf(tab("a", "/a.md"), tab("b", "/b.md"), tab("c", "/c.md"));
    const afterActivateB = W.activateTab(ws, "b");
    const closed = W.closeTab(afterActivateB, "b");
    expect(closed.tabs.map((t) => t.id)).toEqual(["a", "c"]);
    expect(closed.activeTabId).toBe("c"); // right neighbor
  });

  it("falls back to the left neighbor when closing the last tab", () => {
    const ws = workspaceOf(tab("a", "/a.md"), tab("b", "/b.md"));
    const closed = W.closeTab(W.activateTab(ws, "b"), "b");
    expect(closed.activeTabId).toBe("a");
  });

  it("clears the active tab when the only tab is closed", () => {
    const ws = workspaceOf(tab("a", "/a.md"));
    const closed = W.closeTab(ws, "a");
    expect(closed.tabs).toHaveLength(0);
    expect(closed.activeTabId).toBeNull();
  });

  it("cycles siblings with wraparound", () => {
    const ws = workspaceOf(tab("a", "/a.md"), tab("b", "/b.md"), tab("c", "/c.md"));
    expect(W.siblingTabId(W.activateTab(ws, "c"), 1)).toBe("a");
    expect(W.siblingTabId(W.activateTab(ws, "a"), -1)).toBe("c");
  });

  it("reorders tabs by dropping one into a gap", () => {
    const ws = workspaceOf(tab("a", "/a.md"), tab("b", "/b.md"), tab("c", "/c.md"));
    expect(W.dropTab(ws, "a", 3).tabs.map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(W.dropTab(ws, "c", 0).tabs.map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(W.dropTab(ws, "b", 1)).toBe(ws); // its own slot
  });

  it("returns the same reference when an operation changes nothing", () => {
    const ws = workspaceOf(tab("a", "/a.md"));
    expect(W.activateTab(ws, "a")).toBe(ws); // already active
    expect(W.closeTab(ws, "nope")).toBe(ws); // unknown id
    expect(W.setScrollTop(ws, "a", 0)).toBe(ws); // unchanged scroll
  });

  it("updates a tab's scroll position", () => {
    const ws = workspaceOf(tab("a", "/a.md"));
    const updated = W.setScrollTop(ws, "a", 240);
    expect(W.activeTab(updated)?.viewState.scrollTop).toBe(240);
  });

  it("snapshots to a session and restores into a fresh workspace", () => {
    const ws = W.activateTab(workspaceOf(tab("a", "/a.md"), tab("b", "/b.md")), "b");
    const session = W.toSession(ws);
    expect(session.tabs.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
    expect(session.activeIndex).toBe(1);

    const restored = W.restoreWorkspace(ws.tabs, [], 0);
    expect(restored.activeTabId).toBe("a");
    expect(W.restoreWorkspace([], [], 0)).toEqual(W.emptyWorkspace);
  });

  it("toggles mode, updates content (dirty), and marks saved", () => {
    const ws = workspaceOf(tab("a", "/a.md"));
    const edited = W.updateContent(ws, "a", "# changed");
    expect(W.activeTab(edited)?.document).toMatchObject({ content: "# changed" });

    const inEdit = W.setMode(edited, "a", "edit");
    expect(W.activeTab(inEdit)?.viewState.mode).toBe("edit");

    const saved = W.markSaved(inEdit, "a", { path: "/b.md", name: "b.md" });
    expect(W.activeTab(saved)?.document.path).toBe("/b.md");
    expect(W.activeTab(saved)?.savedContent).toBe("# changed");
  });

  it("reloads content from disk (clean baseline, bumped revision)", () => {
    const ws = workspaceOf(tab("a", "/a.md"));
    const reloaded = W.reloadContent(ws, "a", "# from disk");
    const t = W.activeTab(reloaded);
    expect(t?.document).toMatchObject({ content: "# from disk" });
    expect(t?.savedContent).toBe("# from disk"); // clean after reload
    expect(t?.revision).toBe(1); // forces the editor to remount
    // no-op when content already matches and is clean
    expect(W.reloadContent(reloaded, "a", "# from disk")).toBe(reloaded);
  });

  it("reloads a PDF tab by bumping its revision, and ignores markdown tabs", () => {
    const ws = workspaceOf(tab("a", "/a.md"));
    expect(W.reloadPdf(ws, "a")).toBe(ws);
    const withPdf = W.addTab(ws, createTab("p", createPdfDocument("/p.pdf")));
    const reloaded = W.reloadPdf(withPdf, "p");
    expect(reloaded.tabs.find((t) => t.id === "p")?.revision).toBe(1);
    expect(reloaded.tabs.find((t) => t.id === "a")?.revision).toBe(0);
  });

  describe("mergeRestored", () => {
    const restored = {
      tabs: [tab("r1", "/a.md"), tab("r2", "/b.md"), tab("r3", "/c.md")],
      groups: [],
    };

    it("restores normally into an empty workspace", () => {
      const ws = W.mergeRestored(W.emptyWorkspace, restored, 2);
      expect(ws.tabs.map((t) => t.id)).toEqual(["r1", "r2", "r3"]);
      expect(ws.activeTabId).toBe("r3");
    });

    it("keeps previous tabs when a file opened first (cold launch from Finder)", () => {
      // The double-clicked file beat the restore — previously the session was dropped.
      const opened = W.addTab(W.emptyWorkspace, tab("new", "/new.md"));
      const ws = W.mergeRestored(opened, restored, 2);
      expect(ws.tabs.map((t) => t.document.path)).toEqual(["/a.md", "/b.md", "/c.md", "/new.md"]);
      expect(W.activeTab(ws)?.document.path).toBe("/new.md"); // what the user just opened
    });

    it("doesn't duplicate a file that's both opened and in the session", () => {
      const opened = W.addTab(W.emptyWorkspace, tab("dup", "/b.md"));
      const ws = W.mergeRestored(opened, restored, 0);
      expect(ws.tabs.map((t) => t.document.path)).toEqual(["/a.md", "/b.md", "/c.md"]);
      expect(ws.activeTabId).toBe("r2"); // the restored copy of the opened file
    });
  });
});
