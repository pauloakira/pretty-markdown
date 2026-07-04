import { describe, expect, it } from "vitest";
import { addRecent } from "./RecentFile";

const f = (path: string) => ({ path, name: path.split("/").pop() ?? path });

describe("addRecent", () => {
  it("prepends the newest file", () => {
    const list = addRecent([f("/a.md")], f("/b.md"));
    expect(list.map((x) => x.path)).toEqual(["/b.md", "/a.md"]);
  });

  it("de-duplicates by path, moving an existing file to the front", () => {
    const list = addRecent([f("/a.md"), f("/b.md")], f("/b.md"));
    expect(list.map((x) => x.path)).toEqual(["/b.md", "/a.md"]);
  });

  it("caps the list length", () => {
    const list = addRecent([f("/a"), f("/b"), f("/c")], f("/d"), 3);
    expect(list.map((x) => x.path)).toEqual(["/d", "/a", "/b"]);
  });
});
