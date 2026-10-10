/**
 * Which pages to draw ahead of time, in priority order: `ahead` pages past the viewport in
 * the scroll direction, then `behind` pages on the other side. `first`/`last` are the
 * visible page numbers (1-based); pages outside 1..pageCount are skipped.
 */
export function preRenderPages(
  first: number,
  last: number,
  pageCount: number,
  scrollingDown: boolean,
  ahead: number,
  behind: number,
): number[] {
  const forward = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
  const backward = (from: number, n: number) => Array.from({ length: n }, (_, i) => from - i);
  const pages = scrollingDown
    ? [...forward(last + 1, ahead), ...backward(first - 1, behind)]
    : [...backward(first - 1, ahead), ...forward(last + 1, behind)];
  return pages.filter((page) => page >= 1 && page <= pageCount);
}
