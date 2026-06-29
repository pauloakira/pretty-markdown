import { describe, expect, it } from "vitest";
import { parseSession } from "./Session";

describe("parseSession", () => {
  it("parses a valid session", () => {
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
    expect(session?.tabs[1]).toEqual({ path: "/b.md", mode: "edit", scrollTop: 120 });
  });

  it("drops entries without a string path and defaults missing fields", () => {
    const session = parseSession({
      tabs: [{ path: "/a.md" }, { mode: "edit" }, { path: 42 }],
    });
    expect(session?.tabs).toEqual([{ path: "/a.md", mode: "reader", scrollTop: 0 }]);
    expect(session?.activeIndex).toBe(0);
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
