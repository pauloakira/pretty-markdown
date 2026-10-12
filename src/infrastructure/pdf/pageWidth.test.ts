import { describe, expect, it } from "vitest";
import { samplePages, typicalWidth } from "./pageWidth";

describe("samplePages", () => {
  it("takes the start, the open page, the middle and the end, once each", () => {
    expect(samplePages(1363, 200)).toEqual([1, 2, 3, 200, 682, 1363]);
    expect(samplePages(1363, 1)).toEqual([1, 2, 3, 682, 1363]);
  });

  it("stays within short documents", () => {
    expect(samplePages(1, 1)).toEqual([1]);
    expect(samplePages(2, 2)).toEqual([1, 2]);
    expect(samplePages(4, 9)).toEqual([1, 2, 3, 4]);
  });
});

describe("typicalWidth", () => {
  it("ignores an odd cover", () => {
    expect(typicalWidth([235, 374, 374, 374, 374])).toBe(374);
  });

  it("averages the middle two of an even sample", () => {
    expect(typicalWidth([400, 600])).toBe(500);
    expect(typicalWidth([235, 374, 374, 374])).toBe(374);
  });

  it("has no answer without widths", () => {
    expect(typicalWidth([])).toBeNull();
    expect(typicalWidth([0])).toBeNull();
  });
});
