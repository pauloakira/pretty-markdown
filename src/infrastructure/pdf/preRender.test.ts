import { describe, expect, it } from "vitest";
import { preRenderPages } from "./preRender";

describe("preRenderPages", () => {
  it("favours the scroll direction, then one page behind", () => {
    expect(preRenderPages(10, 10, 22, true, 4, 1)).toEqual([11, 12, 13, 14, 9]);
    expect(preRenderPages(6, 7, 22, false, 4, 1)).toEqual([5, 4, 3, 2, 8]);
  });

  it("stays within the document", () => {
    expect(preRenderPages(1, 1, 22, true, 4, 1)).toEqual([2, 3, 4, 5]);
    expect(preRenderPages(21, 22, 22, true, 4, 1)).toEqual([20]);
    expect(preRenderPages(2, 3, 3, false, 4, 1)).toEqual([1]);
    expect(preRenderPages(1, 1, 1, true, 4, 1)).toEqual([]);
  });
});
