import { describe, expect, it } from "vitest";
import { createMarkdownDocument } from "./Document";
import { createTab, type Tab } from "./Tab";
import { createGroup, nextGroupColor } from "./TabGroup";
import * as W from "./Workspace";

function tab(id: string, path = `/docs/${id}.md`): Tab {
  return createTab(id, createMarkdownDocument(path, `# ${id}`));
}

function workspaceOf(...tabs: Tab[]): W.Workspace {
  return tabs.reduce<W.Workspace>((ws, t) => W.addTab(ws, t), W.emptyWorkspace);
}

const ids = (ws: W.Workspace) => ws.tabs.map((t) => t.id);
const groupOf = (ws: W.Workspace, id: string) => ws.tabs.find((t) => t.id === id)?.groupId;

/** a b c d e, with b+c in group "g" (blue), and `active` focused. */
function grouped(active = "e"): W.Workspace {
  const ws = workspaceOf(tab("a"), tab("b"), tab("c"), tab("d"), tab("e"));
  return W.activateTab(W.groupTabsInto(ws, ["b", "c"], createGroup("g", "G", "blue")), active);
}

describe("Workspace tab groups", () => {
  it("gathers new group members at the leftmost one", () => {
    const ws = workspaceOf(tab("a"), tab("b"), tab("c"), tab("d"));
    const next = W.groupTabsInto(ws, ["d", "b"], createGroup("g", "", "blue"));
    expect(ids(next)).toEqual(["a", "b", "d", "c"]);
    expect(next.groups.map((g) => g.id)).toEqual(["g"]);
    expect(W.groupTabs(next, "g").map((t) => t.id)).toEqual(["b", "d"]);
  });

  it("adds a tab to the end of a group and removes it to just after the group", () => {
    const added = W.addToGroup(grouped(), "e", "g");
    expect(ids(added)).toEqual(["a", "b", "c", "e", "d"]);
    expect(groupOf(added, "e")).toBe("g");

    const removed = W.removeFromGroup(added, "b");
    expect(ids(removed)).toEqual(["a", "c", "e", "b", "d"]);
    expect(groupOf(removed, "b")).toBeNull();
  });

  it("drops a group once its last tab leaves or closes", () => {
    const one = W.groupTabsInto(workspaceOf(tab("a"), tab("b")), ["a"], createGroup("g", "", "red"));
    expect(W.removeFromGroup(one, "a").groups).toEqual([]);
    expect(ids(W.removeFromGroup(one, "a"))).toEqual(["a", "b"]);
    expect(W.closeTab(one, "a").groups).toEqual([]);
  });

  it("ungroups in place and renames/recolors (same ref when unchanged)", () => {
    const ws = grouped();
    const plain = W.ungroup(ws, "g");
    expect(ids(plain)).toEqual(["a", "b", "c", "d", "e"]);
    expect(plain.groups).toEqual([]);
    expect(plain.tabs.every((t) => t.groupId === null)).toBe(true);

    const renamed = W.updateGroup(ws, "g", { name: "PoliVEM", color: "orange" });
    expect(renamed.groups[0]).toMatchObject({ name: "PoliVEM", color: "orange" });
    expect(W.updateGroup(renamed, "g", { name: "PoliVEM" })).toBe(renamed);
  });

  describe("collapsing", () => {
    it("hides the group's tabs from the visible strip and sibling cycling", () => {
      const ws = W.setGroupCollapsed(grouped("a"), "g", true);
      expect(W.visibleTabs(ws).map((t) => t.id)).toEqual(["a", "d", "e"]);
      expect(W.siblingTabId(ws, 1)).toBe("d"); // skips b, c
    });

    it("moves focus out of a group being collapsed, or refuses if nothing else is visible", () => {
      const ws = W.setGroupCollapsed(grouped("c"), "g", true);
      expect(ws.groups[0].collapsed).toBe(true);
      expect(ws.activeTabId).toBe("d"); // nearest visible to the right

      const alone = W.groupTabsInto(workspaceOf(tab("a"), tab("b")), ["a", "b"], createGroup("g", "", "blue"));
      expect(W.setGroupCollapsed(alone, "g", true)).toBe(alone);
    });

    it("expands a collapsed group when one of its tabs is activated", () => {
      const ws = W.setGroupCollapsed(grouped("a"), "g", true);
      const next = W.activateTab(ws, "b");
      expect(next.groups[0].collapsed).toBe(false);
    });

    it("closing the active tab skips tabs hidden in a collapsed group", () => {
      const ws = W.setGroupCollapsed(grouped("a"), "g", true);
      expect(W.closeTab(ws, "a").activeTabId).toBe("d");
    });
  });

  describe("drag and drop", () => {
    it("joins a group when dropped between two of its tabs", () => {
      const ws = grouped();
      // visible: a b c d e — gap 2 is between b and c
      expect(W.resolveDrop(ws, "e", 2)).toEqual({ beforeId: "c", groupId: "g" });
      const next = W.dropTab(ws, "e", 2);
      expect(ids(next)).toEqual(["a", "b", "e", "c", "d"]);
      expect(groupOf(next, "e")).toBe("g");
    });

    it("keeps its group when reordered at the group's edge", () => {
      const next = W.dropTab(grouped(), "c", 1); // before b
      expect(ids(next)).toEqual(["a", "c", "b", "d", "e"]);
      expect(groupOf(next, "c")).toBe("g");
    });

    it("leaves the group when dropped away from it", () => {
      const next = W.dropTab(grouped(), "b", 5); // the end
      expect(ids(next)).toEqual(["a", "c", "d", "e", "b"]);
      expect(groupOf(next, "b")).toBeNull();
    });

    it("leaves the group when dropped on empty space or a chip, even at the bar's end", () => {
      const ws = W.groupTabsInto(workspaceOf(tab("a"), tab("b"), tab("c")), ["b", "c"], createGroup("g", "", "blue"));
      expect(groupOf(W.dropTab(ws, "b", 3), "b")).toBe("g"); // on the last tab's edge: stays
      const out = W.dropTab(ws, "b", 3, true); // past the last tab
      expect(ids(out)).toEqual(["a", "c", "b"]);
      expect(groupOf(out, "b")).toBeNull();
      const onChip = W.dropTab(ws, "c", 1, true); // over g's chip, before b
      expect(ids(onChip)).toEqual(["a", "c", "b"]);
      expect(groupOf(onChip, "c")).toBeNull();
    });

    it("ignores tabs hidden in a collapsed group when resolving the gap", () => {
      const ws = W.setGroupCollapsed(grouped("a"), "g", true);
      // visible: a d e — gap 2 is between d and e
      const next = W.dropTab(ws, "a", 2);
      expect(ids(next)).toEqual(["b", "c", "d", "a", "e"]);
      expect(groupOf(next, "a")).toBeNull();
    });
  });

  describe("moving a whole group", () => {
    /** a [g: b c] d [h: e] — units: a, g, d, h */
    function two(): W.Workspace {
      return W.groupTabsInto(grouped("a"), ["e"], createGroup("h", "H", "red"));
    }

    it("lists the tab bar as units", () => {
      expect(W.tabUnits(two())).toEqual([
        { kind: "tab", tabId: "a" },
        { kind: "group", groupId: "g" },
        { kind: "tab", tabId: "d" },
        { kind: "group", groupId: "h" },
      ]);
    });

    it("moves a group before another unit, to the front, or to the end", () => {
      // other units (without g): a, d, h
      expect(ids(W.moveGroup(two(), "g", 0))).toEqual(["b", "c", "a", "d", "e"]);
      expect(ids(W.moveGroup(two(), "g", 2))).toEqual(["a", "d", "b", "c", "e"]); // before h
      expect(ids(W.moveGroup(two(), "g", 3))).toEqual(["a", "d", "e", "b", "c"]); // the end
      expect(ids(W.moveGroup(two(), "h", 1))).toEqual(["a", "e", "b", "c", "d"]); // before g
    });

    it("keeps the group intact (members, order, collapsed) and is a no-op in place", () => {
      const ws = W.setGroupCollapsed(two(), "g", true);
      const moved = W.moveGroup(ws, "g", 3);
      expect(W.groupTabs(moved, "g").map((t) => t.id)).toEqual(["b", "c"]);
      expect(W.findGroup(moved, "g")?.collapsed).toBe(true);
      expect(moved.groups.map((g) => g.id)).toEqual(["h", "g"]); // groups follow bar order
      expect(W.moveGroup(ws, "g", 1)).toBe(ws); // already before d
      expect(W.moveGroup(ws, "nope", 0)).toBe(ws);
    });
  });

  describe("groupByFolder", () => {
    let n = 0;
    const newId = () => `auto-${++n}`;

    it("groups ungrouped tabs sharing a folder, named after it", () => {
      const ws = workspaceOf(
        tab("s3", "/work/PoliVEM/section3.md"),
        tab("n1", "/work/Sobolev/notes1.md"),
        tab("s4", "/work/PoliVEM/section4.md"),
        tab("solo", "/elsewhere/solo.md"),
        tab("n2", "C:\\work\\Sobolev\\notes2.md"),
      );
      const next = W.groupByFolder(ws, newId);
      expect(next.groups.map((g) => g.name)).toEqual(["PoliVEM"]); // Sobolev paths differ
      expect(ids(next)).toEqual(["s3", "s4", "n1", "solo", "n2"]);
      expect(groupOf(next, "solo")).toBeNull();
    });

    it("names groups by the folder segment that tells them apart", () => {
      const ws = workspaceOf(
        tab("a1", "/papers/runge/docs/a1.md"),
        tab("a2", "/papers/runge/docs/a2.md"),
        tab("b1", "/papers/polivem/docs/b1.md"),
        tab("b2", "/papers/polivem/docs/b2.md"),
      );
      expect(W.groupByFolder(ws, newId).groups.map((g) => g.name)).toEqual(["runge", "polivem"]);
      expect(W.folderLabel("/x/notes", ["/x/notes", "/y/docs"])).toBe("notes");
      expect(W.folderLabel("C:\\work\\docs", ["/home/docs"])).toBe("work");
    });

    it("adds tabs to an existing group that holds only their folder", () => {
      const base = workspaceOf(tab("a", "/p/a.md"), tab("x", "/q/x.md"), tab("b", "/p/b.md"));
      const ws = W.groupTabsInto(base, ["a"], createGroup("mine", "Mine", "green"));
      const next = W.groupByFolder(ws, newId);
      expect(next.groups.map((g) => g.id)).toEqual(["mine"]);
      expect(ids(next)).toEqual(["a", "b", "x"]);
      expect(W.groupByFolder(next, newId)).toBe(next); // nothing left to do
    });
  });

  describe("session", () => {
    it("round-trips groups through a session snapshot", () => {
      const ws = W.setGroupCollapsed(W.updateGroup(grouped("a"), "g", { name: "PoliVEM" }), "g", true);
      const session = W.toSession(ws);
      expect(session.groups).toEqual([{ name: "PoliVEM", color: "blue", collapsed: true }]);
      expect(session.tabs.map((t) => t.group)).toEqual([null, 0, 0, null, null]);

      const tabs = ws.tabs.map((t) => ({ ...t, groupId: t.groupId === null ? null : "fresh" }));
      const restored = W.restoreWorkspace(tabs, [createGroup("fresh", "PoliVEM", "blue")], 0);
      expect(restored.groups).toHaveLength(1);
      expect(W.groupTabs(restored, "fresh").map((t) => t.id)).toEqual(["b", "c"]);
    });

    it("restores with the active tab's group expanded", () => {
      const tabs = [{ ...tab("a"), groupId: "g" }, tab("b")];
      const restored = W.restoreWorkspace(tabs, [{ ...createGroup("g", "", "red"), collapsed: true }], 0);
      expect(restored.groups[0].collapsed).toBe(false);
    });

    it("merges restored groups with groups opened before the restore", () => {
      const opened = W.groupTabsInto(workspaceOf(tab("x"), tab("y")), ["x", "y"], createGroup("live", "", "red"));
      const restored = { tabs: [{ ...tab("r"), groupId: "old" }], groups: [createGroup("old", "Old", "blue")] };
      const ws = W.mergeRestored(opened, restored, 0);
      expect(ws.groups.map((g) => g.id)).toEqual(["old", "live"]);
      expect(ids(ws)).toEqual(["r", "x", "y"]);
    });
  });

  it("picks the first unused color for a new group", () => {
    expect(nextGroupColor([])).toBe("blue");
    expect(nextGroupColor([createGroup("1", "", "blue")])).toBe("red");
  });
});
