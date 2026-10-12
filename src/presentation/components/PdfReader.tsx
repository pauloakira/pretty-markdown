import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useContainer } from "../../composition/ContainerContext";
import type { HighlightColor } from "../../domain/values/Highlight";
import { currentItemId, type OutlineItem } from "../../domain/values/Outline";
import { stepPdfZoom, type PdfView, type PdfZoom } from "../../domain/values/ViewState";
import type { FindListener, FindTarget } from "../find/FindTarget";
import type { EditHistory, HighlightAvailability, PdfInfo, PdfTool, PdfViewerHandle } from "../pdf/PdfViewer";
import { ContentsSidebar, type ContentsPanel } from "./ContentsSidebar";
import { PdfToolbar } from "./PdfToolbar";

/** Quiet period after the last scroll/zoom before the position is recorded (as Reader). */
const VIEW_SETTLE_MS = 400;
/**
 * The "reading line": how far below the top of the view (in pages) a section counts as the
 * one being read. Bookmarks usually point a little below the top of their page (a chapter
 * title's top margin), so at the top of a chapter's page that chapter is current.
 */
const CURRENT_LOOKAHEAD_PAGES = 0.2;

/** What the app needs from the PDF on screen before quitting. */
export interface PdfReaderControl {
  /** Where the reader is now. */
  view(): PdfView;
  /** Save highlights not saved yet. */
  flush(): Promise<void>;
  /** Search the document (the find bar). */
  find(listener: FindListener): FindTarget;
}

interface PdfReaderProps {
  path: string;
  name: string;
  initialView: PdfView;
  /** Record where the reader is (debounced while scrolling, and once on unmount). */
  onViewPersist: (view: PdfView) => void;
  /** The highlighter colour (a setting: the last one picked). */
  highlightColor: HighlightColor;
  onHighlightColorChange: (color: HighlightColor) => void;
  /** Filled while a document is showing, so the app can flush it before quitting. */
  controlRef: MutableRefObject<PdfReaderControl | null>;
  /** The document is showing (e.g. to re-run an open search on it). */
  onReady?: () => void;
  /** The contents sidebar (its open state and width are app settings). */
  contents: ContentsPanel;
}

type Status =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly info: PdfInfo; readonly highlighting: HighlightAvailability }
  | { readonly kind: "error"; readonly message: string };

/**
 * A PDF tab: its toolbar plus the viewer. Mounted with `key={tab.id}` like Reader, so each
 * tab gets a fresh instance; it reads the file, mounts the viewer at the saved view, and
 * on unmount records the final view, saves pending highlights, then tears the viewer down.
 *
 * Highlights are saved into the PDF automatically (docs/PDF_HIGHLIGHTS_PLAN.md §3.2): the
 * viewer calls `onSave` shortly after each change, which writes through `PdfSaver`.
 *
 * Each mount renders into its own freshly created container element, so a slow mount that
 * finishes after a newer one (React StrictMode runs effects twice in dev) can't clobber it.
 */
export function PdfReader({
  path,
  name,
  initialView,
  onViewPersist,
  highlightColor,
  onHighlightColorChange,
  controlRef,
  onReady,
  contents,
}: PdfReaderProps) {
  const { documentService, pdfViewer, pdfSaver, linkOpener } = useContainer();
  // React renders nothing inside the host; the viewer's container is appended by hand.
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PdfViewerHandle | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [page, setPage] = useState(initialView.page);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [fitWidth, setFitWidth] = useState(initialView.zoom === "page-width");
  const [tool, setToolState] = useState<PdfTool>("select");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState<EditHistory>({ canUndo: false, canRedo: false });
  const [outline, setOutline] = useState<readonly OutlineItem[] | null>(null);
  const [position, setPosition] = useState(initialView.page - 1 + initialView.pageOffset);

  // Latest props for the mount effect, which only re-runs when the file changes. The view
  // is read when the viewer mounts, after the file has loaded: a remount (the file changed
  // on disk) gets the position the previous viewer recorded as it went away.
  const initialViewRef = useRef(initialView);
  initialViewRef.current = initialView;
  const persistRef = useRef(onViewPersist);
  persistRef.current = onViewPersist;
  const colorRef = useRef(highlightColor);
  colorRef.current = highlightColor;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

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
      setPosition(view.page - 1 + view.pageOffset);
      setFitWidth(view.zoom === "page-width");
      if (handle) setZoomPercent(Math.round(handle.currentScale() * 100));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => persistRef.current(view), VIEW_SETTLE_MS);
    };

    const onSave = async (bytes: Uint8Array) => {
      const result = await pdfSaver.save(path, bytes);
      if (!cancelled) setSaveError(result.ok ? null : result.error);
      return result;
    };

    // Read only when the viewer needs the bytes (not when it still has this PDF parsed).
    const source = {
      key: path,
      load: async () => {
        // If this PDF was just closed with highlights still saving, read it after that save.
        await pdfSaver.settled(path);
        const data = await documentService.loadPdfData(path);
        // Before pdf.js takes ownership of the bytes (they move to its worker).
        if (data.ok) pdfSaver.opened(path, data.value);
        return data;
      },
    };

    setStatus({ kind: "loading" });
    void (async () => {
      const mounted = await pdfViewer.mount(container, source, {
        initialView: () => initialViewRef.current,
        onViewChange,
        onExternalLink: (url) => void linkOpener.openExternal(url),
        highlightColor: colorRef.current,
        onSave,
        onToolChange: (next) => {
          if (!cancelled) setToolState(next);
        },
        onHistoryChange: (next) => {
          if (!cancelled) setHistory(next);
        },
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
      const shown = handle;
      controlRef.current = {
        view: () => shown.view(),
        flush: () => shown.flush(),
        find: (listener) => shown.find(listener),
      };
      setStatus({ kind: "ready", info: handle.info, highlighting: handle.highlighting });
      onReadyRef.current?.();
      setZoomPercent(Math.round(handle.currentScale() * 100));
      setPage(handle.view().page);
    })();

    // Leaving the app (iPad: switching apps, which may end it) saves highlights right away.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void handle?.flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (handle) {
        persistRef.current(handle.view());
        // Save pending highlights before releasing the document (saving needs it).
        const closing = handle;
        pdfSaver.finishLater(path, closing.flush().finally(() => closing.destroy()));
      }
      handleRef.current = null;
      controlRef.current = null;
      container.remove();
    };
  }, [path, documentService, pdfViewer, pdfSaver, linkOpener, controlRef]);

  // The bookmarks, read the first time the contents are shown for this document.
  const ready = status.kind === "ready";
  useEffect(() => {
    if (!ready || !contents.open || outline !== null) return;
    let cancelled = false;
    void handleRef.current?.outline().then((items) => {
      if (!cancelled) setOutline(items);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, contents.open, outline]);
  const currentId = useMemo(
    () => (outline ? currentItemId(outline, position + CURRENT_LOOKAHEAD_PAGES) : null),
    [outline, position],
  );
  const goToSection = useCallback((item: OutlineItem) => {
    if (item.position !== null) handleRef.current?.goTo(item.position);
  }, []);

  // A new colour from the toolbar (it's a setting, so it arrives as a prop).
  useEffect(() => {
    handleRef.current?.setHighlightColor(highlightColor);
  }, [highlightColor]);

  const setTool = useCallback((next: PdfTool) => {
    const handle = handleRef.current;
    if (!handle?.highlighting.allowed) return;
    handle.setTool(next);
    setToolState(next);
  }, []);

  const setZoom = useCallback((zoom: PdfZoom) => handleRef.current?.setZoom(zoom), []);
  const zoomBy = useCallback((direction: 1 | -1) => {
    const handle = handleRef.current;
    if (handle) handle.setZoom(stepPdfZoom(handle.currentScale(), direction));
  }, []);

  // Apple Pencil double-tap (iPad; sent by the native side) toggles highlight mode.
  useEffect(() => {
    const onDoubleTap = () => setTool(tool === "highlight" ? "select" : "highlight");
    window.addEventListener("pencil-double-tap", onDoubleTap);
    return () => window.removeEventListener("pencil-double-tap", onDoubleTap);
  }, [setTool, tool]);

  // ⌘+ / ⌘− / ⌘0 and ⌘⇧H / Esc while this tab is showing (only the active tab is mounted).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!handleRef.current) return;
      if (e.key === "Escape" && tool === "highlight") {
        setTool("select");
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey && e.code === "KeyH") {
        e.preventDefault();
        setTool(tool === "highlight" ? "select" : "highlight");
        return;
      }
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
  }, [setZoom, zoomBy, setTool, tool]);

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
        highlighting={status.kind === "ready" ? status.highlighting : null}
        tool={tool}
        highlightColor={highlightColor}
        onToolChange={setTool}
        onHighlightColorChange={onHighlightColorChange}
        history={history}
        onUndo={() => handleRef.current?.undo()}
        onRedo={() => handleRef.current?.redo()}
        contentsOpen={contents.open}
        onToggleContents={() => contents.setOpen(!contents.open)}
      />
      {saveError && (
        <div className="banner banner--error" role="alert">
          {saveError}
        </div>
      )}
      <div className="doc-body">
      {contents.open && (
        <ContentsSidebar
          outline={ready ? outline : null}
          currentId={currentId}
          showPages
          emptyMessage="This PDF has no table of contents."
          sourceLabel="From the PDF's bookmarks"
          panel={contents}
          onSelect={goToSection}
        />
      )}
      <div className={`pdf-reader__stage${tool === "highlight" ? " pdf-reader__stage--highlighting" : ""}`}>
        <div className="pdf-reader__host" ref={hostRef} />
        {status.kind === "loading" && <div className="pdf-reader__status">Opening {name}…</div>}
        {status.kind === "error" && (
          <div className="pdf-reader__status pdf-reader__status--error" role="alert">
            {status.message}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
