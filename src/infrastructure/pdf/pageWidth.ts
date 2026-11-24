/**
 * "Fit width" for documents whose pages aren't all the same size. pdf.js fits the page it
 * knows at that moment, which on opening is the first page: a book whose cover is smaller
 * than its pages opened with every page too wide (a 235 pt cover in a 374 pt book: 1.6×
 * too wide, 2.5× the pixels to draw). We fit the typical page instead, measured on a
 * small sample.
 */

/** Pages to measure (1-based, distinct, ascending): the start, the open page, the middle, the end. */
export function samplePages(pageCount: number, openPage: number): number[] {
  const pages = [1, 2, 3, openPage, Math.ceil(pageCount / 2), pageCount];
  return [...new Set(pages.filter((p) => p >= 1 && p <= pageCount))].sort((a, b) => a - b);
}

/** The typical page width: the median of the sampled widths, so an odd cover doesn't count. */
export function typicalWidth(widths: readonly number[]): number | null {
  const sorted = widths.filter((w) => w > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** CSS pixels per PDF point (pdf.js's PixelsPerInch.PDF_TO_CSS_UNITS). */
const PDF_TO_CSS_UNITS = 96 / 72;
/** The room pdf.js leaves beside a page fitted to the width (its SCROLLBAR_PADDING). */
const FIT_PADDING = 40;

/**
 * The scale at which a page `pageWidth` points wide fits a container `containerWidth` CSS
 * pixels wide, as pdf.js's "page-width" computes it. Null without a width.
 */
export function fitWidthScale(containerWidth: number, pageWidth: number | null): number | null {
  if (!pageWidth || pageWidth <= 0 || containerWidth <= FIT_PADDING) return null;
  return (containerWidth - FIT_PADDING) / (pageWidth * PDF_TO_CSS_UNITS);
}
