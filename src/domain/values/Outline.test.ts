import { describe, expect, it } from "vitest";
import {
  buildHeadingTree,
  currentItemId,
  filterOutline,
  flattenOutline,
  pathTo,
  type OutlineItem,
} from "./Outline";

const h = (id: string, level: number) => ({ id, level, title: id });

/** The tree's shape as ids, e.g. "a(b,c)". */
const shape = (items: readonly OutlineItem[]): string =>
  items.map((i) => (i.children.length ? `${i.id}(${shape(i.children)})` : i.id)).join(",");

const item = (id: string, position: number | null, children: OutlineItem[] = []): OutlineItem => ({
  id,
  title: id,
  position,
  children,
});

describe("buildHeadingTree", () => {
  it("nests headings by level", () => {
    const tree = buildHeadingTree([h("a", 1), h("a1", 2), h("a2", 2), h("a2x", 3), h("b", 1), h("b1", 2)]);
    expect(shape(tree)).toBe("a(a1,a2(a2x)),b(b1)");
  });

  it("nests a skipped level under the nearest heading above it", () => {
    expect(shape(buildHeadingTree([h("a", 1), h("deep", 3), h("mid", 2)]))).toBe("a(deep,mid)");
  });

  it("keeps headings that come before any higher one at the top", () => {
    expect(shape(buildHeadingTree([h("x", 3), h("y", 2), h("z", 1)]))).toBe("x,y,z");
  });

  it("numbers positions in document order", () => {
    const tree = buildHeadingTree([h("a", 1), h("a1", 2), h("b", 1)]);
    expect(flattenOutline(tree).map((i) => i.position)).toEqual([0, 1, 2]);
  });
});

describe("currentItemId", () => {
  const outline = [item("ch1", 0, [item("s1", 0.5), item("s2", 3.2)]), item("ch2", 9, [item("s3", 9)]), item("toc", null)];

  it("is the section that starts last at or before the position", () => {
    expect(currentItemId(outline, 0.6)).toBe("s1");
    expect(currentItemId(outline, 3.2)).toBe("s2");
    expect(currentItemId(outline, 8.99)).toBe("s2");
  });

  it("prefers the deeper item when two start at the same place", () => {
    expect(currentItemId(outline, 9.4)).toBe("s3");
  });

  it("is null before the first section", () => {
    expect(currentItemId([item("a", 2)], 1)).toBeNull();
  });

  it("copes with an outline that isn't in page order", () => {
    expect(currentItemId([item("late", 50), item("early", 2)], 10)).toBe("early");
  });
});

describe("pathTo", () => {
  const outline = [item("a", 0, [item("a1", 1, [item("a1x", 2)])]), item("b", 3)];

  it("lists the chapters down to the item", () => {
    expect(pathTo(outline, "a1x")).toEqual(["a", "a1", "a1x"]);
    expect(pathTo(outline, "b")).toEqual(["b"]);
  });

  it("is empty for an unknown id", () => {
    expect(pathTo(outline, "zz")).toEqual([]);
  });
});

describe("filterOutline", () => {
  const outline = [
    { ...item("ch1", 0, [item("Convex sets", 1), item("Carathéodory's theorem", 2)]), title: "Basics" },
    { ...item("ch2", 5, [item("Hats", 6)]), title: "Convex hulls" },
  ];

  it("keeps matches with the chapters they sit in", () => {
    expect(shape(filterOutline(outline, "theorem"))).toBe("ch1(Carathéodory's theorem)");
  });

  it("ignores case and accents", () => {
    expect(shape(filterOutline(outline, "CARATHEODORY"))).toBe("ch1(Carathéodory's theorem)");
  });

  it("keeps a matching chapter whole", () => {
    expect(shape(filterOutline(outline, "convex"))).toBe("ch1(Convex sets),ch2(Hats)");
  });

  it("keeps everything for an empty query", () => {
    expect(filterOutline(outline, "  ")).toHaveLength(2);
  });
});
