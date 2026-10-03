import { describe, expect, it } from "vitest";
import { parseSession } from "./Session";

describe("parseSession", () => {
  it("parses a version-1 session (before groups) as ungrouped", () => {
    const session = parseSession({
      version: 1,
      activeIndex: 1,
      tabs: [
        { path: "/a.md", mode: "reader", scrollTop: 0 },
        { path: "/b.md", mode: "edit", scrollTop: 120 },
      ],
    });
    expect(session?.tabs).toHaveLength(2);
    expect(session?.activeIndex).toBe(1);
    expect(session?.tabs[1]).toEqual({ path: "/b.md", mode: "edit", scrollTop: 120, group: null });
    expect(session?.groups).toEqual([]);
  });

  it("drops entries without a string path and defaults missing fields", () => {
    const session = parseSession({
      tabs: [{ path: "/a.md" }, { mode: "edit" }, { path: 42 }],
    });
    expect(session?.tabs).toEqual([{ path: "/a.md", mode: "reader", scrollTop: 0, group: null }]);
    expect(session?.activeIndex).toBe(0);
  });

  it("parses groups and tab membership, dropping out-of-range indexes", () => {
    const session = parseSession({
      version: 2,
      activeIndex: 0,
      groups: [{ name: "PoliVEM", color: "blue", collapsed: true }, { color: "mauve" }],
      tabs: [
        { path: "/a.md", group: 0 },
        { path: "/b.md", group: 1 },
        { path: "/c.md", group: 7 },
        { path: "/d.md", group: "0" },
      ],
    });
    expect(session?.groups).toEqual([
      { name: "PoliVEM", color: "blue", collapsed: true },
      { name: "", color: "grey", collapsed: false }, // malformed, but keeps its slot
    ]);
    expect(session?.tabs.map((t) => t.group)).toEqual([0, 1, null, null]);
  });

  it("normalizes an unknown mode to reader", () => {
    const session = parseSession({ tabs: [{ path: "/a.md", mode: "weird" }] });
    expect(session?.tabs[0].mode).toBe("reader");
  });

  it("returns null for non-object or shapeless input", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession("nope")).toBeNull();
    expect(parseSession({ notTabs: true })).toBeNull();
  });
});
