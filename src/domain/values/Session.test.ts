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

  it("parses v3 PDF view state, clamping it and dropping junk", () => {
    const session = parseSession({
      version: 3,
      activeIndex: 0,
      groups: [],
      tabs: [
        { path: "/p/a.pdf", pdf: { page: 4, pageOffset: 0.5, zoom: 1.5 } },
        { path: "/p/b.pdf", pdf: { page: -2, pageOffset: 7, zoom: 50 } },
        { path: "/p/c.pdf", pdf: "page 3" },
        { path: "/n/d.md" },
      ],
    });
    expect(session?.version).toBe(3);
    expect(session?.tabs.map((t) => t.pdf)).toEqual([
      { page: 4, pageOffset: 0.5, zoom: 1.5 },
      { page: 1, pageOffset: 1, zoom: 4 },
      undefined,
      undefined,
    ]);
  });

  it("reads a v2 session (no PDF view state) as v3", () => {
    const session = parseSession({
      version: 2,
      activeIndex: 0,
      groups: [],
      tabs: [{ path: "/p/a.pdf", mode: "reader", scrollTop: 0, group: null }],
    });
    expect(session?.version).toBe(3);
    expect(session?.tabs[0]).toEqual({ path: "/p/a.pdf", mode: "reader", scrollTop: 0, group: null });
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
