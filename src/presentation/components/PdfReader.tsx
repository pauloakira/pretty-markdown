import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useContainer } from "../../composition/ContainerContext";
import { stepPdfZoom, type PdfView, type PdfZoom } from "../../domain/values/ViewState";
import type { PdfInfo, PdfViewerHandle } from "../pdf/PdfViewer";
import { PdfToolbar } from "./PdfToolbar";

/** Quiet period after the last scroll/zoom before the position is recorded (as Reader). */
const VIEW_SETTLE_MS = 400;

interface PdfReaderProps {
  path: string;
  name: string;
  initialView: PdfView;
  /** Record where the reader is (debounced while scrolling, and once on unmount). */
  onViewPersist: (view: PdfView) => void;
  /** Filled with a getter for the live view, so the app can flush it before quitting. */
  viewRef: MutableRefObject<(() => PdfView) | null>;
}

type Status =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly info: PdfInfo }
  | { readonly kind: "error"; readonly message: string };

/**
 * A PDF tab: its toolbar plus the viewer. Mounted with `key={tab.id}` like Reader, so each
 * tab gets a fresh instance; it reads the file, mounts the viewer at the saved view, and
 * on unmount records the final view and tears the viewer down.
 *
 * Each mount renders into its own freshly created container element, so a slow mount that
 * finishes after a newer one (React StrictMode runs effects twice in dev) can't clobber it.
 */
export function PdfReader({ path, name, initialView, onViewPersist, viewRef }: PdfReaderProps) {
  const { documentService, pdfViewer, linkOpener } = useContainer();
  // React renders nothing inside the host; the viewer's container is appended by hand.
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PdfViewerHandle | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [page, setPage] = useState(initialView.page);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [fitWidth, setFitWidth] = useState(initialView.zoom === "page-width");

  // Latest props for the mount effect, which only re-runs when the file changes.
  const initialViewRef = useRef(initialView);
  const persistRef = useRef(onViewPersist);
  persistRef.current = onViewPersist;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const container = document.createElement("div");
    container.className = "pdf-reader__scroll";
    host.append(container);

    let cancelled = false;
    let handle: PdfViewerHandle | null = null;
    let timer = 0;

    const onViewChange = (view: PdfView) => {
      setPage(view.page);
      setFitWidth(view.zoom === "page-width");
      if (handle) setZoomPercent(Math.round(handle.currentScale() * 100));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => persistRef.current(view), VIEW_SETTLE_MS);
    };

    setStatus({ kind: "loading" });
    void (async () => {
      const data = await documentService.loadPdfData(path);
      if (cancelled) return;
      if (!data.ok) {
        setStatus({ kind: "error", message: data.error });
        return;
      }
      const mounted = await pdfViewer.mount(container, data.value, {
        initialView: initialViewRef.current,
        onViewChange,
        onExternalLink: (url) => void linkOpener.openExternal(url),
      });
      if (!mounted.ok) {
        if (!cancelled) setStatus({ kind: "error", message: mounted.error });
        return;
      }
      if (cancelled) {
        mounted.value.destroy();
        return;
      }
      handle = mounted.value;
      handleRef.current = handle;
      viewRef.current = () => (handle as PdfViewerHandle).view();
      setStatus({ kind: "ready", info: handle.info });
      setZoomPercent(Math.round(handle.currentScale() * 100));
      setPage(handle.view().page);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (handle) {
        persistRef.current(handle.view());
        handle.destroy();
      }
      handleRef.current = null;
      viewRef.current = null;
      container.remove();
    };
  }, [path, documentService, pdfViewer, linkOpener, viewRef]);

  const setZoom = useCallback((zoom: PdfZoom) => handleRef.current?.setZoom(zoom), []);
  const zoomBy = useCallback((direction: 1 | -1) => {
    const handle = handleRef.current;
    if (handle) handle.setZoom(stepPdfZoom(handle.currentScale(), direction));
  }, []);

  // ⌘+ / ⌘− / ⌘0 while this tab is showing (only the active tab is mounted).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !handleRef.current) return;
      if (e.code === "Equal" || e.code === "NumpadAdd") {
        e.preventDefault();
        zoomBy(1);
      } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault();
        zoomBy(-1);
      } else if (e.code === "Digit0" || e.code === "Numpad0") {
        e.preventDefault();
        setZoom("page-width");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setZoom, zoomBy]);

  return (
    <div className="pdf-reader">
      <PdfToolbar
        name={name}
        title={status.kind === "ready" ? status.info.title : null}
        pageCount={status.kind === "ready" ? status.info.pageCount : null}
        page={page}
        zoomPercent={zoomPercent}
        fitWidth={fitWidth}
        onGoToPage={(target) => handleRef.current?.goToPage(target)}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onFitWidth={() => setZoom("page-width")}
      />
      <div className="pdf-reader__stage">
        <div className="pdf-reader__host" ref={hostRef} />
        {status.kind === "loading" && <div className="pdf-reader__status">Opening {name}…</div>}
        {status.kind === "error" && (
          <div className="pdf-reader__status pdf-reader__status--error" role="alert">
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
