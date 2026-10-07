/*
 * pdf.js adapter for the PdfViewer contract (src/presentation/pdf/PdfViewer.ts).
 *
 * Loaded on demand — only LazyPdfViewerFactory imports this module, dynamically — so
 * pdf.js and its CSS stay out of the main bundle. Uses the *legacy* build, which
 * transpiles newer JavaScript features: WKWebView's engine is the user's macOS Safari
 * version, which can lag behind what the modern build expects.
 */
import {
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  OutputScale,
  PasswordException,
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
import { err, ok, type Result } from "../../domain/values/Result";
import { normalizePdfView, type PdfView, type PdfZoom } from "../../domain/values/ViewState";
import type { PdfMountOptions, PdfViewerHandle } from "../../presentation/pdf/PdfViewer";
import { preRenderPages } from "./preRender";

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

  const viewerEl = document.createElement("div");
  viewerEl.className = "pdfViewer";
  container.replaceChildren(viewerEl);

  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus });
  const viewer = new PDFViewer({
    container,
    viewer: viewerEl,
    eventBus,
    linkService,
    annotationMode: AnnotationMode.ENABLE, // links, but no form filling or editing
  });
  linkService.setViewer(viewer);

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

  const metadata = await pdf.getMetadata().catch(() => null);
  const rawTitle = (metadata?.info as { Title?: unknown } | undefined)?.Title;
  const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : null;

  return ok({
    info: { pageCount: pdf.numPages, title },
    view,
    currentScale: () => viewer.currentScale,
    setZoom(next) {
      zoom = next;
      applyScale();
    },
    goToPage(page) {
      viewer.currentPageNumber = Math.min(Math.max(1, Math.round(page)), viewer.pagesCount);
    },
    destroy() {
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
