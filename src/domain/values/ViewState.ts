/** Reading vs. editing for a tab. */
export type EditorMode = "reader" | "edit";

/** PDF zoom: a scale factor (1 = 100%) or "fit the page width to the window". */
export type PdfZoom = number | "page-width";

/** Allowed scale range for a numeric PDF zoom (25%–400%). */
export const PDF_ZOOM_MIN = 0.25;
export const PDF_ZOOM_MAX = 4;

/**
 * Where a PDF reader was. A page plus a fraction down that page, rather than a pixel
 * offset, because pixel offsets change meaning whenever the zoom (or window width, for
 * "page-width") changes.
 */
export interface PdfView {
  /** 1-based page number. */
  readonly page: number;
  /** How far down the page the top of the viewport is, 0 (top) to 1 (bottom). */
  readonly pageOffset: number;
  readonly zoom: PdfZoom;
}

export const initialPdfView: PdfView = { page: 1, pageOffset: 0, zoom: "page-width" };

/**
 * Per-tab view state — the bits of "where the reader was" that survive tab switches.
 * Markdown tabs use `scrollTop` and `mode`; PDF tabs (always in reader mode) use `pdf`.
 */
export interface ViewState {
  readonly scrollTop: number;
  readonly mode: EditorMode;
  readonly pdf?: PdfView;
}

export const initialViewState: ViewState = { scrollTop: 0, mode: "reader" };

/** Clamp a PDF view into range: page ≥ 1 (whole), offset in [0, 1], zoom in bounds. */
export function normalizePdfView(view: PdfView): PdfView {
  const page = Number.isFinite(view.page) ? Math.max(1, Math.floor(view.page)) : 1;
  const pageOffset = Number.isFinite(view.pageOffset)
    ? Math.min(1, Math.max(0, view.pageOffset))
    : 0;
  const zoom =
    view.zoom === "page-width" || !Number.isFinite(view.zoom)
      ? "page-width"
      : Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, view.zoom));
  if (page === view.page && pageOffset === view.pageOffset && zoom === view.zoom) return view;
  return { page, pageOffset, zoom };
}

/** Parse an untrusted value (e.g. from the session file) into a PdfView, or null. */
export function parsePdfView(raw: unknown): PdfView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.page !== "number") return null;
  return normalizePdfView({
    page: v.page,
    pageOffset: typeof v.pageOffset === "number" ? v.pageOffset : 0,
    zoom: typeof v.zoom === "number" ? v.zoom : "page-width",
  });
}

/** Zoom levels the zoom in/out controls step through (like a PDF reader's menu). */
export const PDF_ZOOM_STEPS: readonly number[] = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
];

/** A step this close to the current scale (relative) counts as "already there". */
const ZOOM_STEP_TOLERANCE = 0.03;

/**
 * The next zoom step above (direction 1) or below (-1) the current scale. From an
 * in-between scale (e.g. 1.18 from "page-width"), it moves to the nearest step on that
 * side, so one press never skips a level — but never to a step within 3% of the current
 * scale (fit-width at 150.4% must zoom out to 125%, not to an invisible 150%). Steps are
 * at least ~6% apart, so the tolerance can't skip one. Stays put at the ends of the range.
 */
export function stepPdfZoom(currentScale: number, direction: 1 | -1): number {
  if (direction === 1) {
    const above = currentScale * (1 + ZOOM_STEP_TOLERANCE);
    return PDF_ZOOM_STEPS.find((s) => s > above) ?? PDF_ZOOM_MAX;
  }
  const below = currentScale * (1 - ZOOM_STEP_TOLERANCE);
  return [...PDF_ZOOM_STEPS].reverse().find((s) => s < below) ?? PDF_ZOOM_MIN;
}
