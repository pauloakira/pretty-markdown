import type { PageViewport } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PdfRect } from "../../domain/values/PdfRect";

/** An area of a page in CSS pixels from the page's top-left corner. */
export interface PageArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A rect in PDF points (from the page's bottom-left) as an area of the page on screen, at
 * the viewport's scale and rotation. pdf.js's page viewports are in CSS pixels.
 */
export function viewportArea(viewport: Pick<PageViewport, "convertToViewportPoint">, rect: PdfRect): PageArea {
  const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1]) as number[];
  const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3]) as number[];
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
