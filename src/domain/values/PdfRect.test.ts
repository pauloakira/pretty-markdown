import { describe, expect, it } from "vitest";
import { formatRect, parseRect, roundRect, sameArea } from "./PdfRect";

describe("PdfRect", () => {
  it("rounds outwards to whole points", () => {
    expect(roundRect([72.4, 540.9, 300.2, 552.1])).toEqual([72, 540, 301, 553]);
  });

  it("reads back what it writes, and nothing that isn't an area", () => {
    expect(parseRect(formatRect([72, 540, 301, 553]))).toEqual([72, 540, 301, 553]);
    expect(parseRect("72,540,301")).toBeNull();
    expect(parseRect("72,540,x,553")).toBeNull();
    expect(parseRect("72,,301,553")).toBeNull();
    expect(parseRect("301,540,72,553")).toBeNull(); // right of left edge
    expect(parseRect("")).toBeNull();
  });

  it("takes a re-saved highlight a point or two off as the same", () => {
    expect(sameArea([72, 540, 301, 553], [72, 540, 301, 553])).toBe(true);
    expect(sameArea([72, 540, 301, 553], [71, 539, 302, 555])).toBe(true);
  });

  it("tells apart neighbouring lines and part of a line", () => {
    const line: [number, number, number, number] = [72, 540, 301, 553];
    expect(sameArea(line, [72, 526, 301, 539])).toBe(false); // the line below
    expect(sameArea(line, [72, 540, 150, 553])).toBe(false); // its first third
    expect(sameArea(line, [400, 540, 500, 553])).toBe(false);
  });
});
