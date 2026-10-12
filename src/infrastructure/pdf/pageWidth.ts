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
