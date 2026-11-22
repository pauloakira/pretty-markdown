import { describe, expect, it } from "vitest";
import { viewportArea } from "./revealArea";

/**
 * A page viewport as pdf.js builds one for an A4 page (595 × 842 points) at `scale`:
 * its transform flips y so the origin is the top-left, as `PageViewport` does.
 */
function a4(scale: number, rotation: 0 | 90 = 0) {
  const transform =
    rotation === 0 ? [scale, 0, 0, -scale, 0, 842 * scale] : [0, scale, scale, 0, 0, 0];
  return {
    convertToViewportPoint(x: number, y: number) {
      const [a, b, c, d, e, f] = transform;
      return [a * x + c * y + e, b * x + d * y + f];
    },
  };
}

describe("viewportArea", () => {
  it("turns a rect in PDF points into CSS pixels from the page's top-left", () => {
    expect(viewportArea(a4(1), [72, 396, 400, 410])).toEqual({ left: 72, top: 432, width: 328, height: 14 });
    expect(viewportArea(a4(2), [72, 396, 400, 410])).toEqual({ left: 144, top: 864, width: 656, height: 28 });
  });

  it("orders the corners whichever way the page is turned", () => {
    expect(viewportArea(a4(1, 90), [72, 396, 400, 410])).toEqual({ left: 396, top: 72, width: 14, height: 328 });
  });
});
