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
  /**
   * PDF tabs: where the reader was before each jump (a quote's link, the contents, Go to
   * page), most recent last, for "Back". Kept while the app runs, not in the session.
   */
  readonly back?: readonly PdfView[];
  /** PDF tabs: the Notes panel beside the page (docs/RESEARCH_READER.md). Closed if absent. */
  readonly notes?: NotesPanelView;
}

/** The Notes panel of a PDF tab: whether it's open, and how wide (px, dragged). */
export interface NotesPanelView {
  readonly open: boolean;
  readonly widthPx: number;
}

/** The Notes panel's width range, in px. The page keeps the rest of the window. */
export const NOTES_PANEL_WIDTH = { min: 300, max: 900, default: 460 } as const;

export const initialNotesPanel: NotesPanelView = { open: false, widthPx: NOTES_PANEL_WIDTH.default };

/** Clamp a Notes panel's width into range (whole px). */
export function normalizeNotesPanel(panel: NotesPanelView): NotesPanelView {
  const widthPx = Number.isFinite(panel.widthPx)
    ? Math.min(NOTES_PANEL_WIDTH.max, Math.max(NOTES_PANEL_WIDTH.min, Math.round(panel.widthPx)))
    : NOTES_PANEL_WIDTH.default;
  return widthPx === panel.widthPx ? panel : { open: panel.open, widthPx };
}

/** Parse an untrusted value (e.g. from the session file) into a Notes panel, or null. */
export function parseNotesPanel(raw: unknown): NotesPanelView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.open !== "boolean") return null;
  return normalizeNotesPanel({
    open: v.open,
    widthPx: typeof v.widthPx === "number" ? v.widthPx : NOTES_PANEL_WIDTH.default,
  });
}

/** How many places "Back" remembers per tab. */
export const BACK_LIMIT = 50;

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

/** A numeric PDF scale clamped into the allowed range. */
export function clampPdfScale(scale: number): number {
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, scale));
}

/**
 * How close (relative) a pinch must end to the fit-width scale to snap to "Fit width".
 * Wide enough to land on without trying (a finger's wobble is a few percent), narrow
 * enough that a deliberate small zoom in or out stays.
 */
export const PINCH_FIT_SNAP = 0.06;

/**
 * The zoom a pinch ends on: its scale, clamped; or "page-width" when that's within
 * `PINCH_FIT_SNAP` of the fit-width scale, so the page fits the window again (and keeps
 * fitting as the window resizes) rather than sitting a few points too wide or narrow.
 */
export function pinchedPdfZoom(scale: number, fitScale: number | null): PdfZoom {
  const clamped = clampPdfScale(scale);
  if (fitScale !== null && fitScale > 0 && Math.abs(clamped / fitScale - 1) <= PINCH_FIT_SNAP) {
    return "page-width";
  }
  return clamped;
}
