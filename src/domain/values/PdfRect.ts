/**
 * An area of a PDF page, in PDF points from the page's bottom-left corner:
 * [left, bottom, right, top]. A highlight's /Rect is one; an excerpt keeps its highlight's,
 * so the quote in the notes and the highlight in the PDF can find each other.
 */
export type PdfRect = readonly [number, number, number, number];

/** A highlight in a document: its page and the area it covers. */
export interface HighlightPlace {
  /** 1-based page number. */
  readonly page: number;
  readonly rect: PdfRect;
}

/**
 * How much two rects must overlap (shared area over combined area) to be the same
 * highlight. Lenient: another app re-saving the PDF may recompute a highlight's /Rect from
 * its quads, a point or two off, while two different passages barely overlap at all.
 */
const SAME_AREA = 0.6;

/** `rect` in whole points, which is precise enough and keeps links short. */
export function roundRect(rect: PdfRect): PdfRect {
  const [left, bottom, right, top] = rect;
  return [Math.floor(left), Math.floor(bottom), Math.ceil(right), Math.ceil(top)];
}

/** Read "left,bottom,right,top"; null unless it's four numbers spanning a real area. */
export function parseRect(text: string): PdfRect | null {
  const parts = text.split(",");
  if (parts.length !== 4 || parts.some((part) => part.trim() === "")) return null;
  const [left, bottom, right, top] = parts.map(Number);
  if (![left, bottom, right, top].every(Number.isFinite)) return null;
  if (right <= left || top <= bottom) return null;
  return [left, bottom, right, top];
}

export function formatRect(rect: PdfRect): string {
  return rect.join(",");
}

/** Whether `a` and `b` are the same area, give or take the drift of a re-save. */
export function sameArea(a: PdfRect, b: PdfRect): boolean {
  const width = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const height = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (width <= 0 || height <= 0) return false;
  const shared = width * height;
  const combined = area(a) + area(b) - shared;
  return shared / combined >= SAME_AREA;
}

function area(rect: PdfRect): number {
  return (rect[2] - rect[0]) * (rect[3] - rect[1]);
}
