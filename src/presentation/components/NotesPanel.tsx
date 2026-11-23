import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useContainer } from "../../composition/ContainerContext";
import { fileName } from "../../domain/entities/Document";
import { resolveFileLink } from "../../domain/values/Link";
import { NOTES_PANEL_WIDTH } from "../../domain/values/ViewState";
import { FileLinkContext, useDocumentLinks } from "../hooks/useDocumentLinks";
import type { PassageTarget } from "../pdf/PdfViewer";

/** The page keeps at least this much of the window beside the panel (px). */
const PAGE_MIN_PX = 360;
/** How long a quote just added stays marked in the panel (matches `notes-new` in theme.css). */
const NEW_EXCERPT_MS = 2400;

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "none"; readonly notesPath: string }
  | { readonly kind: "notes"; readonly notesPath: string; readonly html: string; readonly excerptCount: number }
  | { readonly kind: "error"; readonly message: string };

interface NotesPanelProps {
  /** The PDF whose notes these are. */
  documentPath: string;
  widthPx: number;
  onResize: (widthPx: number) => void;
  /** Bumped when the notes changed here (Add to notes, Remove), to read them again. */
  revision: number;
  /** A quote just added: bring it into view and mark it for a moment. */
  newExcerptId: string | null;
  /** A quote's link to a passage of this PDF was followed. */
  onFollow: (target: PassageTarget) => void;
  /** A quote of this PDF is hovered (outline its passage), or no longer (null). */
  onMark: (target: PassageTarget | null) => void;
  /** Follow any other link to a file, relative to the notes file at `fromPath`. */
  onFileLink: (href: string, fromPath: string) => void;
  /** Open a file in a tab (the notes file itself, to edit it). */
  onOpenFile: (path: string) => void;
}

/**
 * The Notes panel (docs/RESEARCH_READER.md): the PDF's notes file, `<name>.notes.md`,
 * rendered beside the page. A quote's "↗ p. 133" jumps to its passage in this tab (with
 * Back), and hovering a quote outlines its passage on the page. Writing happens in the
 * notes file's own tab for now ("Open as tab").
 */
export function NotesPanel({
  documentPath,
  widthPx,
  onResize,
  revision,
  newExcerptId,
  onFollow,
  onMark,
  onFileLink,
  onOpenFile,
}: NotesPanelProps) {
  const { notesService, pipeline } = useContainer();
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [reads, setReads] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Read the notes on opening, after a change made here, and when the app comes back to
  // the front (they may have been edited in another app).
  useEffect(() => {
    let cancelled = false;
    void notesService.readNotes(documentPath).then((read) => {
      if (cancelled) return;
      if (!read.ok) setLoaded({ kind: "error", message: read.error });
      else if (read.value.text === null) setLoaded({ kind: "none", notesPath: read.value.notesPath });
      else
        setLoaded({
          kind: "notes",
          notesPath: read.value.notesPath,
          html: pipeline.render(read.value.text),
          excerptCount: read.value.excerptCount,
        });
    });
    return () => {
      cancelled = true;
    };
  }, [notesService, pipeline, documentPath, revision, reads]);
  useEffect(() => {
    const onFocus = () => setReads((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Set imperatively (as Reader does), only when the rendered notes change.
  const html = loaded.kind === "notes" ? loaded.html : null;
  useLayoutEffect(() => {
    if (articleRef.current && html !== null) articleRef.current.innerHTML = html;
  }, [html]);

  // A quote just added: scroll it into view and mark it.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!newExcerptId || html === null || !scroll) return;
    const quote = articleRef.current?.querySelector<HTMLElement>(`[data-excerpt="${CSS.escape(newExcerptId)}"]`);
    if (!quote) return;
    // By hand: `scrollIntoView` doesn't move nested overflow in WKWebView.
    const offset = quote.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    if (offset < 0 || offset + quote.offsetHeight > scroll.clientHeight) {
      scroll.scrollTop = Math.max(0, scroll.scrollTop + offset - scroll.clientHeight / 3);
    }
    quote.classList.add("excerpt--new");
    const timer = window.setTimeout(() => quote.classList.remove("excerpt--new"), NEW_EXCERPT_MS);
    return () => window.clearTimeout(timer);
  }, [newExcerptId, html]);

  const notesPath = loaded.kind === "notes" || loaded.kind === "none" ? loaded.notesPath : null;

  // Where a quote's link goes, if it's a passage of this PDF.
  const passageOf = useCallback(
    (href: string | null): PassageTarget | null => {
      if (!href || !notesPath) return null;
      const link = resolveFileLink(href, notesPath);
      if (!link || link.path !== documentPath || link.page === undefined) return null;
      return { page: link.page, ...(link.rect ? { rect: link.rect } : {}) };
    },
    [notesPath, documentPath],
  );

  // Links: this PDF's passages jump here; anything else opens as from the notes file.
  const followLink = useCallback(
    (href: string) => {
      const passage = passageOf(href);
      if (passage) onFollow(passage);
      else if (notesPath) onFileLink(href, notesPath);
    },
    [passageOf, onFollow, onFileLink, notesPath],
  );

  // Hovering a quote outlines its passage on the page.
  const markRef = useRef(onMark);
  markRef.current = onMark;
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    let current: Element | null = null;
    const onOver = (event: MouseEvent) => {
      const quote = (event.target as Element | null)?.closest?.("blockquote.excerpt") ?? null;
      if (quote === current) return;
      current = quote;
      const href = quote?.querySelector(".excerpt__source a")?.getAttribute("href") ?? null;
      markRef.current(passageOf(href));
    };
    const onLeave = () => {
      current = null;
      markRef.current(null);
    };
    article.addEventListener("mouseover", onOver);
    article.addEventListener("mouseleave", onLeave);
    return () => {
      article.removeEventListener("mouseover", onOver);
      article.removeEventListener("mouseleave", onLeave);
    };
  }, [passageOf, html]);
  // The outline goes with the panel.
  useEffect(() => () => markRef.current(null), []);

  // Drag the left edge to resize; the page keeps room beside it.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthPx;
    const room = (panelRef.current?.parentElement?.clientWidth ?? Infinity) - PAGE_MIN_PX;
    const max = Math.max(NOTES_PANEL_WIDTH.min, Math.min(NOTES_PANEL_WIDTH.max, room));
    let frame = 0;
    let width = startWidth;
    const onMove = (move: PointerEvent) => {
      width = Math.min(max, Math.max(NOTES_PANEL_WIDTH.min, Math.round(startWidth - (move.clientX - startX))));
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          onResize(width);
        });
    };
    const onUp = () => {
      cancelAnimationFrame(frame);
      onResize(width);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <FileLinkContext.Provider value={followLink}>
      <aside className="notes-panel" style={{ width: widthPx }} ref={panelRef} aria-label="Notes">
        <div className="notes-panel__resize" onPointerDown={startResize} aria-hidden="true" />
        <header className="notes-panel__header">
          <svg className="notes-panel__icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 1.5h6l3 3v10h-9z" />
            <path d="M9.5 1.5v3h3" />
            <path d="M5.5 11.5v-4l1.5 2 1.5-2v4M10.5 7.5v4m-1.2-1.3 1.2 1.3 1.2-1.3" />
          </svg>
          <div className="notes-panel__title">
            <span className="notes-panel__name" title={notesPath ?? undefined}>
              {notesPath ? fileName(notesPath) : "Notes"}
            </span>
            <span className="notes-panel__where">
              {loaded.kind === "none" ? "Made beside the PDF at your first Add to notes" : "Beside the PDF"}
            </span>
          </div>
        </header>
        <NotesBody loaded={loaded} scrollRef={scrollRef} articleRef={articleRef} />
        <footer className="notes-panel__footer">
          <span>
            {loaded.kind === "notes"
              ? `${loaded.excerptCount} ${loaded.excerptCount === 1 ? "excerpt" : "excerpts"} · plain Markdown`
              : ""}
          </span>
          {loaded.kind === "notes" && (
            <button className="notes-panel__open" onClick={() => onOpenFile(loaded.notesPath)} title="Open the notes in a tab, to write in them">
              Open as tab ↗
            </button>
          )}
        </footer>
      </aside>
    </FileLinkContext.Provider>
  );
}

/** The rendered notes, or what to say when there are none. */
function NotesBody({
  loaded,
  scrollRef,
  articleRef,
}: {
  loaded: Loaded;
  scrollRef: RefObject<HTMLDivElement | null>;
  articleRef: RefObject<HTMLElement | null>;
}) {
  // Inside the provider, so links in the notes go to the panel's handler.
  useDocumentLinks(scrollRef);
  return (
    <div className="notes-panel__scroll" ref={scrollRef}>
      {loaded.kind === "none" && (
        <div className="notes-panel__empty">
          <p className="notes-panel__empty-title">No notes yet</p>
          <p>
            Select a passage in the PDF and choose <strong>Add to notes</strong> (⌘E). It's
            highlighted on the page and quoted here, with a link back to it.
          </p>
        </div>
      )}
      {loaded.kind === "error" && (
        <p className="notes-panel__empty" role="alert">
          {loaded.message}
        </p>
      )}
      <article ref={articleRef} className="reader markdown-body notes-panel__notes" hidden={loaded.kind !== "notes"} />
    </div>
  );
}
