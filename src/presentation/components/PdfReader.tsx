import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useContainer } from "../../composition/ContainerContext";
import { fileName } from "../../domain/entities/Document";
import type { HighlightColor } from "../../domain/values/Highlight";
import type { HighlightPlace } from "../../domain/values/PdfRect";
import { quoteToMarkdown } from "../../domain/values/Excerpt";
import { currentItemId, type OutlineItem } from "../../domain/values/Outline";
import { stepPdfZoom, type NotesPanelView, type PdfView, type PdfZoom } from "../../domain/values/ViewState";
import { copyText } from "../clipboard/copyText";
import type { FindListener, FindTarget } from "../find/FindTarget";
import type {
  EditHistory,
  HighlightAvailability,
  PassageTarget,
  PdfInfo,
  PdfTool,
  PdfViewerHandle,
  SelectedPassage,
  SelectionPlace,
} from "../pdf/PdfViewer";
import { ContentsSidebar, type ContentsPanel } from "./ContentsSidebar";
import { NotesPanel } from "./NotesPanel";
import { PdfToolbar } from "./PdfToolbar";
import { SelectionPopover } from "./SelectionPopover";

/** Quiet period after the last scroll/zoom before the position is recorded (as Reader). */
const VIEW_SETTLE_MS = 400;
/**
 * The "reading line": how far below the top of the view (in pages) a section counts as the
 * one being read. Bookmarks usually point a little below the top of their page (a chapter
 * title's top margin), so at the top of a chapter's page that chapter is current.
 */
const CURRENT_LOOKAHEAD_PAGES = 0.2;

/**
 * A touch screen (iPad): the selection popover goes below a selection, as iPadOS puts its
 * own menu above it.
 */
const TOUCH_SCREEN = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

/** How long a notes notice stays (errors stay until dismissed). */
const NOTICE_MS = 8000;

/**
 * What the reader is told about their notes: that a highlight they removed is quoted, or
 * an error. (A quote just added shows in the Notes panel, with its note open.)
 */
type NotesNotice =
  | {
      /** The reader removed a highlight whose passage is quoted in the notes. */
      readonly kind: "quoted";
      readonly notesPath: string;
      readonly excerptIds: readonly string[];
    }
  | { readonly kind: "error"; readonly message: string };

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
  /** Open a file in a tab (the notes file, from the "Added to notes" notice). */
  onOpenFile: (path: string) => void;
  /** A passage to show once the document is ready (a quote's link was followed), or null. */
  reveal: PassageTarget | null;
  /** The passage has been shown: forget the request. */
  onRevealed: () => void;
  /** Where Back goes (the last place this tab jumped from), or null for no Back. */
  back: PdfView | null;
  /** About to jump (contents, Go to page): remember where the reader is, for Back. */
  onPushBack: (from: PdfView) => void;
  /** Back: take the last place off this tab's list and return it. */
  onPopBack: () => PdfView | null;
  /** This tab's Notes panel: open or not, and its width. */
  notes: NotesPanelView;
  onNotesChange: (notes: NotesPanelView) => void;
  /** Follow a link in the notes to another file, relative to the notes file at `fromPath`. */
  onFileLink: (href: string, fromPath: string) => void;
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
  onOpenFile,
  reveal,
  onRevealed,
  back,
  onPushBack,
  onPopBack,
  notes,
  onNotesChange,
  onFileLink,
}: PdfReaderProps) {
  const { documentService, pdfViewer, pdfSaver, linkOpener, notesService } = useContainer();
  // React renders nothing inside the host; the viewer's container is appended by hand.
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
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
  const [notesNotice, setNotesNotice] = useState<NotesNotice | null>(null);
  // A passage taken while the notes' folder wasn't allowed yet (iPadOS), added once it is.
  const waitingRef = useRef<{ passage: SelectedPassage; place: HighlightPlace | null } | null>(null);
  const [waiting, setWaiting] = useState(false);
  // The Notes panel reads the notes again after each change made here.
  const [notesRevision, setNotesRevision] = useState(0);
  const [newExcerptId, setNewExcerptId] = useState<string | null>(null);
  const notesChanged = useCallback(() => setNotesRevision((n) => n + 1), []);
  // Opens the Notes panel (set below, once `showNotes` exists).
  const openNotesRef = useRef<() => void>(() => {});
  // The selection popover: the selection it's for.
  const [selection, setSelection] = useState<SelectionPlace | null>(null);

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
  const onHighlightRemovedRef = useRef<(place: HighlightPlace) => void>(() => {});

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
        onHighlightRemoved: (place) => {
          if (!cancelled) onHighlightRemovedRef.current(place);
        },
        selectionActions: true,
        onSelectionChange: (next) => {
          if (!cancelled) setSelection(next);
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
  // Jumps remember where the reader was, so Back (⌘[) returns there.
  const pushBackRef = useRef(onPushBack);
  pushBackRef.current = onPushBack;
  const jump = useCallback((go: (handle: PdfViewerHandle) => void) => {
    const handle = handleRef.current;
    if (!handle) return;
    pushBackRef.current(handle.view());
    go(handle);
  }, []);
  const goToSection = useCallback(
    (item: OutlineItem) => {
      const position = item.position;
      if (position !== null) jump((handle) => handle.goTo(position));
    },
    [jump],
  );
  const popBackRef = useRef(onPopBack);
  popBackRef.current = onPopBack;
  const goBack = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const to = popBackRef.current();
    if (to) handle.goTo(to.page - 1 + to.pageOffset);
  }, []);

  // A passage to show (a quote's link was followed): once the document is ready. The app
  // already opened the tab at its page and remembered where it was, for Back.
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  useEffect(() => {
    const handle = handleRef.current;
    if (!ready || reveal === null || !handle) return;
    try {
      handle.revealPassage(reveal);
    } catch {
      // Showing the passage is a nicety; never let it take the reader down.
      handle.goToPage(reveal.page);
    }
    onRevealedRef.current();
  }, [ready, reveal]);

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

  // Quote a passage in this PDF's notes file (docs/RESEARCH_READER.md), with the place of
  // its highlight (if it was highlighted) so each can find the other later.
  const saveToNotes = useCallback(
    async (passage: SelectedPassage, place: HighlightPlace | null) => {
      const added = await notesService.addToNotes(
        path,
        {
          ...passage,
          page: place?.page ?? passage.page,
          color: colorRef.current,
          ...(place ? { rect: place.rect } : {}),
        },
      );
      if (!added.ok && notesService.needsFolder(added.error)) {
        // iPadOS: the notes' folder must be allowed first. The Notes panel asks for it, and
        // the passage goes in once it's allowed.
        waitingRef.current = { passage, place };
        setWaiting(true);
        openNotesRef.current();
        return;
      }
      if (!added.ok) {
        setNotesNotice({ kind: "error", message: added.error });
        return;
      }
      // The new quote shows in the Notes panel (opened if it isn't), its note ready to write.
      notesChanged();
      setNewExcerptId(added.value.excerpt.id);
      openNotesRef.current();
    },
    [notesService, path, notesChanged],
  );

  // A passage waiting for the notes' folder to be allowed: added once it is.
  const folderAllowed = useCallback(() => {
    const waiting = waitingRef.current;
    waitingRef.current = null;
    setWaiting(false);
    if (waiting) void saveToNotes(waiting.passage, waiting.place);
  }, [saveToNotes]);

  // Add the selected text to the notes, highlighting it in the PDF too when the PDF can be
  // highlighted.
  const addToNotes = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    const passage = handle.selectedPassage();
    if (passage === null) {
      setNotesNotice({ kind: "error", message: "Select some text in the PDF first, then Add to notes." });
      return;
    }
    setSelection(null);
    const place = await handle.highlightSelection();
    await saveToNotes(passage, place);
  }, [saveToNotes]);

  // The selection popover's other actions.
  const highlightIn = useCallback(
    async (color: HighlightColor) => {
      const handle = handleRef.current;
      if (!handle) return;
      // The colour picked becomes the highlighter's, as in the toolbar.
      colorRef.current = color;
      handle.setHighlightColor(color);
      onHighlightColorChange(color);
      setSelection(null);
      await handle.highlightSelection();
    },
    [onHighlightColorChange],
  );
  const copyAsQuote = useCallback(async () => {
    const passage = handleRef.current?.selectedPassage() ?? selection?.passage;
    if (!passage) return false;
    // Linked by the PDF's name: right for notes beside it, and readable anywhere else.
    return copyText(quoteToMarkdown(passage, fileName(path)));
  }, [selection, path]);
  const dismissSelection = useCallback(() => setSelection(null), []);
  const popoverBounds = selection?.bounds ?? null;

  // A highlight the reader removed may be quoted in the notes: offer to remove the quote
  // too (it's kept unless they say so).
  onHighlightRemovedRef.current = (place) => {
    void notesService.excerptsOf(path, place).then((found) => {
      if (!found.ok || found.value.length === 0) return;
      setNotesNotice({
        kind: "quoted",
        notesPath: notesService.notesPathFor(path),
        excerptIds: found.value.map((excerpt) => excerpt.id),
      });
    });
  };

  // Notices about the notes go away by themselves; an error stays until dismissed.
  useEffect(() => {
    if (notesNotice === null || notesNotice.kind === "error") return;
    const timer = window.setTimeout(() => setNotesNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notesNotice]);

  // The reader removed a quoted highlight and wants the quote gone as well.
  const removeQuotes = useCallback(async () => {
    if (notesNotice?.kind !== "quoted") return;
    setNotesNotice(null);
    for (const id of notesNotice.excerptIds) {
      const removed = await notesService.removeFromNotes(notesNotice.notesPath, id);
      notesChanged();
      if (!removed.ok) {
        setNotesNotice({ kind: "error", message: removed.error });
        return;
      }
    }
  }, [notesNotice, notesService, notesChanged]);

  // The Notes panel: open or close it (⇧⌘N), follow a quote to its passage, outline one.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const notesChangeRef = useRef(onNotesChange);
  notesChangeRef.current = onNotesChange;
  const showNotes = useCallback((open: boolean) => {
    // A quote just added is shown once (the next time the panel opens, if it's closed).
    if (!open) setNewExcerptId(null);
    notesChangeRef.current({ ...notesRef.current, open });
  }, []);
  openNotesRef.current = () => {
    if (!notesRef.current.open) showNotes(true);
  };
  const resizeNotes = useCallback((widthPx: number) => {
    notesChangeRef.current({ ...notesRef.current, widthPx });
  }, []);
  const followPassage = useCallback(
    (target: PassageTarget) =>
      jump((handle) => {
        try {
          handle.revealPassage(target);
        } catch {
          handle.goToPage(target.page);
        }
      }),
    [jump],
  );
  // A quote deleted or recoloured in the panel: its highlight follows.
  const removeHighlight = useCallback((place: HighlightPlace) => {
    handleRef.current?.removeHighlight(place);
  }, []);
  const recolorHighlight = useCallback((place: HighlightPlace, color: HighlightColor) => {
    handleRef.current?.recolorHighlight(place, color);
  }, []);
  const markPassage = useCallback((target: PassageTarget | null) => {
    try {
      handleRef.current?.markPassage(target);
    } catch {
      // An outline is a nicety; never let it take the reader down.
    }
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

  // ⌘+ / ⌘− / ⌘0, ⌘Z / ⌘⇧Z and ⌘⇧H / Esc while this tab is showing (only the active tab is
  // mounted).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!handleRef.current) return;
      if (e.key === "Escape" && tool === "highlight") {
        setTool("select");
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      // ⌘Z / ⌘⇧Z undo and redo highlights. In highlight mode pdf.js does it itself; in a
      // text field (a note) it's the field's own undo.
      if (!e.altKey && e.code === "KeyZ" && tool !== "highlight") {
        const active = document.activeElement;
        if (active instanceof HTMLElement && (active.isContentEditable || active.matches("input, textarea"))) return;
        e.preventDefault();
        if (e.shiftKey) handleRef.current.redo();
        else handleRef.current.undo();
        return;
      }
      if (!e.shiftKey && !e.altKey && e.code === "BracketLeft") {
        e.preventDefault();
        goBack();
        return;
      }
      if (!e.shiftKey && !e.altKey && e.code === "KeyE") {
        e.preventDefault();
        void addToNotes();
        return;
      }
      if (e.shiftKey && !e.altKey && e.code === "KeyN") {
        e.preventDefault();
        showNotes(!notesRef.current.open);
        return;
      }
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
  }, [setZoom, zoomBy, setTool, tool, addToNotes, goBack, showNotes]);

  return (
    <div className="pdf-reader">
      <PdfToolbar
        name={name}
        title={status.kind === "ready" ? status.info.title : null}
        pageCount={status.kind === "ready" ? status.info.pageCount : null}
        page={page}
        zoomPercent={zoomPercent}
        fitWidth={fitWidth}
        onGoToPage={(target) => jump((handle) => handle.goToPage(target))}
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
        onAddToNotes={() => void addToNotes()}
        notesOpen={notes.open}
        onShowNotes={showNotes}
      />
      {notesNotice?.kind === "quoted" && (
        <div className="banner banner--warn notes-notice" role="status">
          <span>
            {"That highlight is quoted in "}
            <strong>{fileName(notesNotice.notesPath)}</strong>
          </span>
          <span className="banner__actions">
            <button className="banner__btn" onClick={() => void removeQuotes()}>
              {notesNotice.excerptIds.length === 1 ? "Remove the quote" : "Remove the quotes"}
            </button>
            <button className="banner__btn" onClick={() => setNotesNotice(null)}>
              Keep
            </button>
          </span>
        </div>
      )}
      {notesNotice?.kind === "error" && (
        <div className="banner banner--warn notes-notice" role="alert">
          <span>{notesNotice.message}</span>
          <span className="banner__actions">
            <button className="banner__btn" onClick={() => setNotesNotice(null)} aria-label="Dismiss">
              OK
            </button>
          </span>
        </div>
      )}
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
      <div
        className={`pdf-reader__stage${tool === "highlight" ? " pdf-reader__stage--highlighting" : ""}`}
        ref={stageRef}
      >
        <div className="pdf-reader__host" ref={hostRef} />
        {back && ready && (
          <button
            type="button"
            className="back-pill"
            onClick={goBack}
            title="Go back to where you were (⌘[)"
          >
            <span aria-hidden="true">‹</span>
            <span>Back to p. {back.page}</span>
            <kbd className="back-pill__key">⌘[</kbd>
          </button>
        )}
        {ready && tool === "select" && popoverBounds && (
          <SelectionPopover
            bounds={popoverBounds}
            stageRef={stageRef}
            canHighlight={status.highlighting.allowed}
            color={highlightColor}
            onHighlight={(color) => void highlightIn(color)}
            onAddToNotes={() => void addToNotes()}
            onCopy={copyAsQuote}
            onDismiss={dismissSelection}
            below={TOUCH_SCREEN}
          />
        )}
        {status.kind === "loading" && <div className="pdf-reader__status">Opening {name}…</div>}
        {status.kind === "error" && (
          <div className="pdf-reader__status pdf-reader__status--error" role="alert">
            {status.message}
          </div>
        )}
      </div>
      {notes.open && (
        <NotesPanel
          documentPath={path}
          widthPx={notes.widthPx}
          onResize={resizeNotes}
          revision={notesRevision}
          newExcerptId={newExcerptId}
          onFollow={followPassage}
          onMark={markPassage}
          onFileLink={onFileLink}
          onOpenFile={onOpenFile}
          onRemoveHighlight={removeHighlight}
          onRecolorHighlight={recolorHighlight}
          waitingPassage={waiting}
          onFolderAllowed={folderAllowed}
        />
      )}
      </div>
    </div>
  );
}
