import { describe, expect, it } from "vitest";
import { readOutline, type OutlineSource, type RawOutlineItem } from "./pdfOutline";

const ref = (num: number) => ({ num, gen: 0 });
const XYZ = { name: "XYZ" };

/** A fake document: page refs map to indexes; every page is 600 pt tall. */
function source(outline: RawOutlineItem[] | null, named: Record<string, unknown[]> = {}): OutlineSource {
  return {
    getOutline: async () => outline,
    getDestination: async (id) => named[id] ?? null,
    getPageIndex: async (r) => r.num - 100,
    getPage: async () => ({ view: [0, 0, 400, 600] }),
  };
}

const bm = (title: string, dest: RawOutlineItem["dest"], items: RawOutlineItem[] = []): RawOutlineItem => ({
  title,
  dest,
  items,
});

describe("readOutline", () => {
  it("resolves explicit destinations to page index plus the fraction above the point", async () => {
    const outline = await readOutline(source([bm("Ch 1", [ref(102), XYZ, 0, 450, null])]));
    expect(outline).toEqual([{ id: "bookmark-0", title: "Ch 1", position: 2.25, children: [] }]);
  });

  it("resolves named destinations, and nests sections", async () => {
    const outline = await readOutline(
      source([bm("Ch 1", "c1", [bm("1.1", [ref(103), { name: "FitH" }, 600])])], { c1: [ref(100), { name: "Fit" }] }),
    );
    expect(outline[0].position).toBe(0);
    expect(outline[0].children[0].position).toBe(3);
  });

  it("accepts a page index in place of a page reference", async () => {
    const outline = await readOutline(source([bm("Ch", [7, XYZ, null, null, null])]));
    expect(outline[0].position).toBe(7);
  });

  it("keeps bookmarks that point nowhere, without a position", async () => {
    const outline = await readOutline(source([bm("Web", null), bm("Missing", "nope"), bm("  ", [ref(101), XYZ, 0, 600, 0])]));
    expect(outline.map((i) => [i.title, i.position])).toEqual([
      ["Web", null],
      ["Missing", null],
      ["Untitled", 1],
    ]);
  });

  it("is empty for a PDF without bookmarks or with unreadable ones", async () => {
    expect(await readOutline(source(null))).toEqual([]);
    const broken: OutlineSource = { ...source(null), getOutline: () => Promise.reject(new Error("bad")) };
    expect(await readOutline(broken)).toEqual([]);
  });
});
