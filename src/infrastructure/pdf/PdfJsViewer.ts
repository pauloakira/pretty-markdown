/*
 * pdf.js adapter for the PdfViewer contract (src/presentation/pdf/PdfViewer.ts).
 *
 * Loaded on demand — only LazyPdfViewerFactory imports this module, dynamically — so
 * pdf.js and its CSS stay out of the main bundle. Uses the *legacy* build, which
 * transpiles newer JavaScript features: WKWebView's engine is the user's macOS Safari
 * version, which can lag behind what the modern build expects.
 */
import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  OutputScale,
  PasswordException,
  PermissionFlag,
  type AnnotationEditorUIManager,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  EventBus,
  PDFLinkService,
  PDFViewer,
  RenderingStates,
} from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
import "pdfjs-dist/legacy/web/pdf_viewer.css";
import { highlightColorList, highlightHex, type HighlightColor } from "../../domain/values/Highlight";
import { err, ok, type Result } from "../../domain/values/Result";
import { normalizePdfView, type PdfView, type PdfZoom } from "../../domain/values/ViewState";
import type {
  HighlightAvailability,
  PdfMountOptions,
  PdfTool,
  PdfViewerHandle,
} from "../../presentation/pdf/PdfViewer";
import { preRenderPages } from "./preRender";
import { attachTouchSelection } from "./touchSelection";

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Draw pages at no less than 2× pixel density. On a standard (1×) display pdf.js drew
 * glyphs at one canvas pixel per screen pixel, and canvas text gets no font hinting, so
 * letters looked rough and uneven. Drawing at 2× and letting WebKit scale the canvas
 * down supersamples them. Retina screens are already 2×, so nothing changes there.
 * pdf.js reads its pixel ratio from this one getter (the viewer shares the class).
 */
const MIN_PIXEL_RATIO = 2;
Object.defineProperty(OutputScale, "pixelRatio", {
  configurable: true,
  get: () => Math.max(MIN_PIXEL_RATIO, globalThis.devicePixelRatio || 1),
});

/** Where the pdfjs-assets Vite plugin serves pdf.js's data files (see vite.config.ts). */
const assetUrl = (dir: string) => new URL(`/pdfjs/${dir}/`, window.location.href).href;

/** Room for the border/margin pdf.js leaves between pages (9px border + margins). */
const PAGE_GAP_PX = 20;

/**
 * How often scroll/zoom changes are reported, at most. Each report measures page boxes,
 * which forces a layout while pdf.js is rendering — so not every frame. Fast enough for
 * the toolbar's page number; the last change is always reported (trailing).
 */
const REPORT_INTERVAL_MS = 100;

/**
 * Pages drawn ahead of the viewport in the scroll direction (and behind it). pdf.js draws
 * only the visible pages plus one ahead; a momentum flick (trackpad, Magic Mouse) moves
 * ~9 pages/s at fit-width, so readers mostly saw pages that weren't drawn yet popping in.
 * Drawn pages join pdf.js's page buffer (≥ 10 pages, least-recently-used), so memory
 * stays bounded.
 */
const PRERENDER_AHEAD = 4;
const PRERENDER_BEHIND = 1;

/** The slice of PDFViewer's (semi-internal) API the pre-renderer uses; pdfjs-dist is pinned. */
interface VisiblePage {
  readonly id: number;
  readonly view: { readonly renderingState: number };
}
interface VisiblePages {
  readonly first: VisiblePage;
  readonly last: VisiblePage;
  readonly views: readonly VisiblePage[];
  readonly ids: Set<number>;
}
interface ViewerInternals {
  _getVisiblePages(): VisiblePages;
  readonly renderingQueue: { renderHighestPriority(pages?: VisiblePages): void };
  getPageView(index: number): { readonly renderingState: number } | undefined;
  readonly pagesCount: number;
}

/**
 * Quiet period after the last highlight change before it's saved into the file. Short
 * enough that a highlight is on disk almost at once; long enough that a burst of changes
 * (highlight, recolour, undo) becomes one write.
 */
const AUTOSAVE_MS = 1000;

/** Whether this document may be highlighted, and if not, why. */
async function highlightAvailability(pdf: PDFDocumentProxy): Promise<HighlightAvailability> {
  if (pdf.isPureXfa) {
    return { allowed: false, reason: "Highlighting isn't available for this kind of PDF form (XFA)." };
  }
  // pdf.js turns its editor off for these documents; say why instead of a dead button.
  const permissions = await pdf.getPermissions().catch(() => null);
  if (permissions && !permissions.has(PermissionFlag.MODIFY_CONTENTS)) {
    return { allowed: false, reason: "This PDF's permissions don't allow changes, so it can't be highlighted." };
  }
  // Saving into a signed PDF would make readers flag it as "modified after signing".
  const signatures = await pdf.getSignatures().catch(() => null);
  if (signatures && signatures.length > 0) {
    return { allowed: false, reason: "This PDF is digitally signed: highlighting it would invalidate the signature." };
  }
  return { allowed: true };
}

/** A `PDFViewer` option the viewer reads but its type declarations leave out. */
interface ExtraViewerOptions {
  enableHighlightFloatingButton: boolean;
}

/** The annotation storage's change hooks (typed `null` in pdf.js's declarations). */
interface StorageHooks {
  onSetModified: (() => void) | null;
  onResetModified: (() => void) | null;
  onAnnotationEditor: (() => void) | null;
}

/** Outside-document links the app may open in the user's browser. */
const EXTERNAL_LINK = /^(https?|mailto):/i;

function describeLoadError(error: unknown): string {
  if (error instanceof PasswordException) {
    return "This PDF is password-protected. Opening protected PDFs isn't supported yet.";
  }
  if (error instanceof InvalidPDFException) {
    return "This file is damaged or isn't a valid PDF.";
  }
  return `Couldn't open this PDF: ${error instanceof Error ? error.message : String(error)}`;
}

/** Load `data` and show it in `container` (an empty, absolutely positioned scroller). */
export async function mountPdfJs(
  container: HTMLDivElement,
  data: Uint8Array,
  options: PdfMountOptions,
): Promise<Result<PdfViewerHandle>> {
  const loadingTask = getDocument({
    data,
    cMapUrl: assetUrl("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetUrl("standard_fonts"),
    wasmUrl: assetUrl("wasm"),
    iccUrl: assetUrl("iccs"),
    // GPU-backed page canvases, as pdf.js's own viewer uses. The API default (off) makes
    // every canvas `willReadFrequently`, i.e. CPU-backed, which WebKit composites slowly:
    // scrolling stuttered and pages flickered as they were redrawn.
    enableHWA: true,
    // No `isEvalSupported` switch needed: pdf.js 6 never compiles PDF functions with eval,
    // and PDF JavaScript stays off because the viewer has no scripting manager.
  });

  let pdf: PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    void loadingTask.destroy();
    return err(describeLoadError(error));
  }

  const highlighting = await highlightAvailability(pdf);

  const viewerEl = document.createElement("div");
  viewerEl.className = "pdfViewer";
  container.replaceChildren(viewerEl);

  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus });
  const viewerOptions: ConstructorParameters<typeof PDFViewer>[0] & ExtraViewerOptions = {
    container,
    viewer: viewerEl,
    eventBus,
    linkService,
    annotationMode: AnnotationMode.ENABLE, // links, but no form filling
    // The highlight editor: idle ("NONE") until the highlight tool is picked, but a text
    // selection always offers a Highlight button. Off entirely when not allowed.
    annotationEditorMode: highlighting.allowed ? AnnotationEditorType.NONE : AnnotationEditorType.DISABLE,
    annotationEditorHighlightColors: highlightColorList(options.highlightColor),
    enableHighlightFloatingButton: true,
  };
  const viewer = new PDFViewer(viewerOptions);
  linkService.setViewer(viewer);

  // The editor's UI manager arrives through the event bus while the document loads.
  let uiManager: AnnotationEditorUIManager | null = null;
  const onUiManager = (event: { uiManager: AnnotationEditorUIManager }) => {
    uiManager = event.uiManager;
  };
  eventBus.on("annotationeditoruimanager", onUiManager);

  // pdf.js's editor asks its host app to change modes through the event bus: the
  // Highlight button next to a selection asks for highlight mode and creates the highlight
  // once it's in; double-clicking a highlight asks to edit it. pdf.js's own viewer app
  // answers these; here we do, for the modes this app offers (highlighting only).
  const OFFERED_MODES: readonly number[] = [AnnotationEditorType.NONE, AnnotationEditorType.HIGHLIGHT];
  const onModeRequest = (event: { mode: number; editId?: string | null; mustEnterInEditMode?: boolean }) => {
    if (!OFFERED_MODES.includes(event.mode)) return;
    viewer.annotationEditorMode = {
      mode: event.mode,
      editId: event.editId ?? null,
      mustEnterInEditMode: event.mustEnterInEditMode ?? false,
    };
  };
  const onModeChanged = (event: { mode: number }) =>
    options.onToolChange(event.mode === AnnotationEditorType.HIGHLIGHT ? "highlight" : "select");
  eventBus.on("showannotationeditorui", onModeRequest);
  eventBus.on("switchannotationeditormode", onModeRequest);
  eventBus.on("annotationeditormodechanged", onModeChanged);

  // iPadOS clears the text selection when it turns a tap on the floating Highlight button
  // into mouse events, just before the button's click handler runs, so pdf.js found
  // nothing to highlight. Remember the selection when the button is pressed and put it
  // back for the click (capture phase: before pdf.js's own handler on the button).
  let pressedSelection: Range | null = null;
  const isHighlightButton = (target: EventTarget | null) =>
    target instanceof Element && target.closest(".editToolbar .highlightButton") !== null;
  const onButtonPress = (event: Event) => {
    if (!isHighlightButton(event.target)) return;
    const selection = document.getSelection();
    pressedSelection =
      selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
  };
  const onButtonClick = (event: Event) => {
    if (!pressedSelection || !isHighlightButton(event.target)) return;
    const selection = document.getSelection();
    if (selection?.isCollapsed) {
      selection.removeAllRanges();
      selection.addRange(pressedSelection);
    }
    pressedSelection = null;
  };
  container.addEventListener("pointerdown", onButtonPress, true);
  container.addEventListener("click", onButtonClick, true);

  // Touch selection lands where the finger is (iPadOS's own doesn't, over pdf.js's text
  // layer): long-press picks the word under the finger, handles move where dragged.
  const detachTouchSelection = attachTouchSelection(container);

  // The highlighter colour. pdf.js takes the default from the first colour in the list
  // above, but only once per page load (it's static), so set it explicitly as well, once
  // the editor types exist (they register with the first editor layer).
  //
  // pdf.js applies a colour to the selected highlights if there are any, and makes it the
  // default for new ones otherwise. The toolbar's colour means "for new highlights" (pdf.js's
  // own toolbar next to a highlight recolours it), so deselect first.
  let highlightColor: HighlightColor = options.highlightColor;
  const applyHighlightColor = () => {
    if (!uiManager) return;
    uiManager.unselectAll();
    uiManager.updateParams(AnnotationEditorParamsType.HIGHLIGHT_COLOR, highlightHex(highlightColor));
  };
  const onFirstEditorLayer = () => {
    eventBus.off("annotationeditorlayerrendered", onFirstEditorLayer);
    applyHighlightColor();
  };
  eventBus.on("annotationeditorlayerrendered", onFirstEditorLayer);

  const pagesInit = new Promise<void>((resolve) => eventBus.on("pagesinit", () => resolve(), { once: true }));
  viewer.setDocument(pdf);
  linkService.setDocument(pdf, null);
  await pagesInit;

  let zoom: PdfZoom = options.initialView.zoom;

  /** Top and height of page `index` (0-based) in the container's scroll coordinates. */
  const pageBox = (index: number) => {
    const div = viewer.getPageView(index)?.div as HTMLElement | undefined;
    if (!div) return null;
    const top = div.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    return { top, height: div.offsetHeight };
  };

  // The last position measured. Used when the container can't be measured: once React
  // has detached it (a tab switch records the final view after the DOM is gone) or while
  // it has no size, every page measures 0 and the walk below would land on the last page.
  let lastView = normalizePdfView(options.initialView);

  const view = (): PdfView => {
    if (!container.isConnected || container.clientHeight === 0) return lastView;
    const count = viewer.pagesCount;
    const scrollTop = container.scrollTop;
    // The page at the top of the viewport. Probe a little below the edge so the gap above a
    // page (where "go to page" parks the viewport) counts as that page, not the one before.
    const probe = scrollTop + PAGE_GAP_PX;
    // Start from pdf.js's idea of the current page and walk to the one under the probe.
    let index = Math.min(Math.max(viewer.currentPageNumber - 1, 0), count - 1);
    let box = pageBox(index);
    while (box && index > 0 && probe < box.top) box = pageBox(--index);
    while (box && index < count - 1 && probe >= box.top + box.height) box = pageBox(++index);
    const pageOffset = box && box.height > 0 ? (scrollTop - box.top) / box.height : 0;
    lastView = normalizePdfView({ page: index + 1, pageOffset, zoom });
    return lastView;
  };

  const applyScale = () => {
    viewer.currentScaleValue = zoom === "page-width" ? "page-width" : String(zoom);
  };

  // Restore the initial view: zoom first (it changes page sizes), then the position. Both
  // need a laid-out container (fit-width divides by its width), so if it has no size yet
  // (a hidden window), wait for the first real size instead of fitting to zero.
  const applyInitialView = () => {
    applyScale();
    const initial = normalizePdfView(options.initialView);
    const target = pageBox(Math.min(initial.page, viewer.pagesCount) - 1);
    if (target) container.scrollTop = target.top + initial.pageOffset * target.height;
  };
  let initialPending = container.clientWidth === 0;
  if (!initialPending) applyInitialView();

  // Report the view as the reader scrolls/zooms, coalesced to at most one report per
  // tick. A timer rather than requestAnimationFrame: rAF stops in a hidden or minimized
  // window, which left the toolbar and the saved position stale.
  let timer = 0;
  const reportView = () => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      options.onViewChange(view());
    }, REPORT_INTERVAL_MS);
  };
  eventBus.on("updateviewarea", reportView);
  eventBus.on("scalechanging", reportView);
  // Our own scroll listener too: pdf.js tracks scrolling with requestAnimationFrame, which
  // stops in a hidden window, and the last scroll before a tab switch must be recorded.
  container.addEventListener("scroll", reportView, { passive: true });

  // Pre-draw pages around the viewport, favouring the scroll direction, whenever pdf.js
  // has nothing more urgent: after each page finishes drawing, and as the reader scrolls.
  // Pages are queued through pdf.js's own rendering queue, so its cancellation, pausing
  // and page buffer keep working; we just hand it a wider set of "pages to draw".
  const internals = viewer as unknown as ViewerInternals;
  let lastScrollTop = container.scrollTop;
  let scrollingDown = true;
  let preRenderTimer = 0;
  const preRender = () => {
    preRenderTimer = 0;
    const top = container.scrollTop;
    if (top !== lastScrollTop) scrollingDown = top > lastScrollTop;
    lastScrollTop = top;

    const visible = internals._getVisiblePages();
    if (visible.views.length === 0) return;
    const count = internals.pagesCount;
    const first = visible.first.id;
    const last = visible.last.id;
    // Leave the visible pages, and anything already drawing, to pdf.js.
    const drawingNearby = (from: number, to: number) => {
      for (let id = Math.max(1, from); id <= Math.min(count, to); id += 1) {
        if (internals.getPageView(id - 1)?.renderingState === RenderingStates.RUNNING) return true;
      }
      return false;
    };
    if (visible.views.some((v) => v.view.renderingState !== RenderingStates.FINISHED)) return;
    if (drawingNearby(first - PRERENDER_AHEAD, last + PRERENDER_AHEAD)) return;

    const pages: VisiblePage[] = [];
    for (const id of preRenderPages(first, last, count, scrollingDown, PRERENDER_AHEAD, PRERENDER_BEHIND)) {
      const view = internals.getPageView(id - 1);
      // Not drawn yet, or paused mid-draw when something more urgent came up (pdf.js's
      // queue resumes those).
      const pending = view?.renderingState === RenderingStates.INITIAL || view?.renderingState === RenderingStates.PAUSED;
      if (view && pending) pages.push({ id, view });
    }
    if (pages.length === 0) return;
    internals.renderingQueue.renderHighestPriority({
      first: pages[0],
      last: pages[0],
      views: pages,
      ids: new Set(pages.map((p) => p.id)),
    });
  };
  const schedulePreRender = () => {
    if (!preRenderTimer) preRenderTimer = window.setTimeout(preRender, REPORT_INTERVAL_MS);
  };
  eventBus.on("pagerendered", schedulePreRender);
  container.addEventListener("scroll", schedulePreRender, { passive: true });

  // "Fit width" has to be re-fitted when the window (so the container) resizes.
  const resizeObserver = new ResizeObserver(() => {
    if (container.clientWidth === 0) return;
    if (initialPending) {
      initialPending = false;
      applyInitialView();
    } else if (zoom === "page-width") {
      viewer.currentScaleValue = "page-width";
    }
  });
  resizeObserver.observe(container);

  // Links that leave the document go to the app (to open in the browser); never let one
  // navigate the app's own web view. In-document links ("#...") are left to pdf.js.
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    const href = anchor?.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    event.preventDefault();
    event.stopPropagation();
    if (EXTERNAL_LINK.test(href)) options.onExternalLink(href);
  };
  container.addEventListener("click", onClick, true);

  // ---- Autosave -------------------------------------------------------------------
  //
  // Highlights live in pdf.js's annotation storage until saved. Every change (from a hook,
  // an editor event, or just a pointer/key up over the pages: cheap, since a save with
  // nothing new is skipped) schedules a save. A save writes the whole document via
  // `saveDocument()`, an incremental update: the original bytes plus the changes. The
  // storage's hash tells whether anything changed since the last successful save, which
  // also covers removing the last new highlight (pdf.js then marks the storage
  // *un*modified, though the file still has that highlight).
  const storage = pdf.annotationStorage;
  const storageHooks = storage as unknown as StorageHooks;
  let savedHash = storage.serializable.hash;
  let saveTimer = 0;
  let saving: Promise<void> | null = null;

  const saveNow = async (): Promise<void> => {
    const hash = storage.serializable.hash;
    if (hash === savedHash) return;
    let bytes: Uint8Array;
    try {
      bytes = await pdf.saveDocument();
    } catch (error) {
      console.error("Couldn't prepare the highlights for saving:", error);
      return;
    }
    const result = await options.onSave(bytes);
    if (!result.ok) return; // the reader shows the error; retried on the next change
    savedHash = hash;
    // A change made while this save was running is newer than what was written.
    if (storage.serializable.hash === hash) storage.resetModified();
    else scheduleSave();
  };
  const runSave = (): Promise<void> => {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    // One save at a time; a request during a save runs right after it.
    const next = (saving ?? Promise.resolve()).then(saveNow);
    saving = next.finally(() => {
      if (saving === next) saving = null;
    });
    return next;
  };
  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void runSave(), AUTOSAVE_MS);
  };
  // pdf.js clears the selection once it has turned it into a highlight, but on iPadOS the
  // still-running selection gesture then puts back a selection reaching to the end of the
  // page. Clear it again for a moment after each highlight is created.
  const strayTimers: number[] = [];
  const onEditorAdded = () => {
    scheduleSave();
    for (const ms of [30, 150, 400]) {
      strayTimers.push(window.setTimeout(() => document.getSelection()?.removeAllRanges(), ms));
    }
  };
  if (highlighting.allowed) {
    storageHooks.onSetModified = scheduleSave;
    storageHooks.onResetModified = scheduleSave;
    storageHooks.onAnnotationEditor = onEditorAdded;
    eventBus.on("switchannotationeditorparams", scheduleSave);
    eventBus.on("editingstateschanged", scheduleSave);
    container.addEventListener("pointerup", scheduleSave);
    container.addEventListener("keyup", scheduleSave);
  }

  const metadata = await pdf.getMetadata().catch(() => null);
  const rawTitle = (metadata?.info as { Title?: unknown } | undefined)?.Title;
  const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : null;

  return ok({
    info: { pageCount: pdf.numPages, title },
    highlighting,
    view,
    currentScale: () => viewer.currentScale,
    setZoom(next) {
      zoom = next;
      applyScale();
    },
    goToPage(page) {
      viewer.currentPageNumber = Math.min(Math.max(1, Math.round(page)), viewer.pagesCount);
    },
    setTool(tool: PdfTool) {
      if (!highlighting.allowed) return;
      const mode = tool === "highlight" ? AnnotationEditorType.HIGHLIGHT : AnnotationEditorType.NONE;
      viewer.annotationEditorMode = { mode };
      if (tool === "highlight") applyHighlightColor();
    },
    setHighlightColor(color) {
      highlightColor = color;
      applyHighlightColor();
    },
    flush() {
      return highlighting.allowed ? runSave() : Promise.resolve();
    },
    destroy() {
      window.clearTimeout(saveTimer);
      for (const timer of strayTimers) window.clearTimeout(timer);
      storageHooks.onSetModified = null;
      storageHooks.onResetModified = null;
      storageHooks.onAnnotationEditor = null;
      eventBus.off("switchannotationeditorparams", scheduleSave);
      eventBus.off("editingstateschanged", scheduleSave);
      eventBus.off("annotationeditoruimanager", onUiManager);
      container.removeEventListener("pointerdown", onButtonPress, true);
      detachTouchSelection();
      container.removeEventListener("click", onButtonClick, true);
      eventBus.off("showannotationeditorui", onModeRequest);
      eventBus.off("switchannotationeditormode", onModeRequest);
      eventBus.off("annotationeditormodechanged", onModeChanged);
      eventBus.off("annotationeditorlayerrendered", onFirstEditorLayer);
      container.removeEventListener("pointerup", scheduleSave);
      container.removeEventListener("keyup", scheduleSave);
      window.clearTimeout(timer);
      window.clearTimeout(preRenderTimer);
      container.removeEventListener("scroll", schedulePreRender);
      eventBus.off("pagerendered", schedulePreRender);
      resizeObserver.disconnect();
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("scroll", reportView);
      eventBus.off("updateviewarea", reportView);
      eventBus.off("scalechanging", reportView);
      viewer.setDocument(null as unknown as PDFDocumentProxy);
      linkService.setDocument(null);
      void loadingTask.destroy();
      container.replaceChildren();
    },
  });
}
