import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { NoteSaved, RemovedExcerpt } from "../../application/services/NotesService";
import { useContainer } from "../../composition/ContainerContext";
import { fileName } from "../../domain/entities/Document";
import { folderNameOf } from "../../domain/values/FileAccess";
import { quoteToMarkdown, type Excerpt } from "../../domain/values/Excerpt";
import type { HighlightColor } from "../../domain/values/Highlight";
import { resolveFileLink } from "../../domain/values/Link";
import { segmentNotes } from "../../domain/values/NotesFile";
import type { HighlightPlace } from "../../domain/values/PdfRect";
import type { Result } from "../../domain/values/Result";
import { NOTES_PANEL_WIDTH } from "../../domain/values/ViewState";
import { copyText } from "../clipboard/copyText";
import { FileLinkContext, useDocumentLinks } from "../hooks/useDocumentLinks";
import type { PassageTarget } from "../pdf/PdfViewer";
import { ExcerptCard, Html } from "./ExcerptCard";

/** The page keeps at least this much of the window beside the panel (px). */
const PAGE_MIN_PX = 360;
/** Quiet period after a change to the notes file on disk before it's read again. */
const NOTES_SETTLE_MS = 120;
/** How long a deleted quote can be brought back. */
const UNDO_MS = 6000;

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "none"; readonly notesPath: string }
  | { readonly kind: "notes"; readonly notesPath: string; readonly text: string }
  /** The notes' folder must be allowed first (iPadOS: only the PDF itself was given). */
  | { readonly kind: "no-folder"; readonly notesPath: string }
  | { readonly kind: "error"; readonly message: string };

/** The notes as shown: text around the quotes, and the quotes with their notes, rendered. */
type Part =
  | { readonly kind: "text"; readonly html: string }
  | {
      readonly kind: "excerpt";
      readonly excerpt: Excerpt;
      readonly quoteHtml: string;
      readonly note: string;
      readonly noteHtml: string;
    };

/** A quote just deleted: what Undo puts back, and its highlight, removed when Undo goes. */
interface Deleted {
  readonly removed: RemovedExcerpt;
  readonly place: HighlightPlace | null;
}

interface NotesPanelProps {
  /** The PDF whose notes these are. */
  documentPath: string;
  widthPx: number;
  onResize: (widthPx: number) => void;
  /** Bumped when the notes changed here (Add to notes, Remove), to read them again. */
  revision: number;
  /** A quote just added: bring it into view, mark it, and open its note. */
  newExcerptId: string | null;
  /** A quote's link to a passage of this PDF was followed. */
  onFollow: (target: PassageTarget) => void;
  /** A quote of this PDF is hovered (outline its passage), or no longer (null). */
  onMark: (target: PassageTarget | null) => void;
  /** Follow any other link to a file, relative to the notes file at `fromPath`. */
  onFileLink: (href: string, fromPath: string) => void;
  /** Open a file in a tab (the notes file itself). */
  onOpenFile: (path: string) => void;
  /** A quote was deleted for good: take its highlight off the page. */
  onRemoveHighlight: (place: HighlightPlace) => void;
  /** A quote was recoloured: recolour its highlight. */
  onRecolorHighlight: (place: HighlightPlace, color: HighlightColor) => void;
  /** A passage is waiting to go into the notes until their folder is allowed. */
  waitingPassage: boolean;
  /** The notes' folder was allowed (add any passage that was waiting). */
  onFolderAllowed: () => void;
}

/**
 * The Notes panel (docs/RESEARCH_READER.md): the PDF's notes file, `<name>.notes.md`,
 * beside the page, each quote a card with the reader's note on it. Notes are written in
 * place; a card's menu recolours, copies or deletes its quote. A quote's "↗ p. 133" jumps
 * to its passage in this tab (with Back), and hovering a card outlines its passage.
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
  onRemoveHighlight,
  onRecolorHighlight,
  waitingPassage,
  onFolderAllowed,
}: NotesPanelProps) {
  const { fileWatcher, notesService, pipeline } = useContainer();
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [reads, setReads] = useState(0);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const reload = useCallback(() => setReads((n) => n + 1), []);

  // Read the notes on opening, after a change, and when the app comes back to the front
  // (they may have been edited in another app).
  useEffect(() => {
    let cancelled = false;
    void notesService.readNotes(documentPath).then((read) => {
      if (cancelled) return;
      if (!read.ok && notesService.needsFolder(read.error)) {
        setLoaded({ kind: "no-folder", notesPath: notesService.notesPathFor(documentPath) });
      } else if (!read.ok) setLoaded({ kind: "error", message: read.error });
      else if (read.value.text === null) setLoaded({ kind: "none", notesPath: read.value.notesPath });
      else setLoaded({ kind: "notes", notesPath: read.value.notesPath, text: read.value.text });
    });
    return () => {
      cancelled = true;
    };
  }, [notesService, documentPath, revision, reads]);
  useEffect(() => {
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);

  const notesPath = loaded.kind === "notes" || loaded.kind === "none" ? loaded.notesPath : null;

  // Allow the notes' folder: the Files folder picker, opened at the PDF's folder.
  const [asking, setAsking] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const allowFolder = async () => {
    setAsking(true);
    const allowed = await notesService.allowNotesFolder(documentPath);
    setAsking(false);
    if (!report(allowed)) return;
    setElsewhere(allowed.value === "elsewhere");
    if (allowed.value === "allowed") {
      reload();
      onFolderAllowed();
    }
  };
  // Read them again whenever the file changes on disk: edited in a tab, in another app, or
  // synced from another device. (Saves made here come back too; they read as no change.)
  const watchedPath = loaded.kind === "notes" ? loaded.notesPath : null;
  useEffect(() => {
    if (watchedPath === null) return;
    let timer = 0;
    // A write comes as a burst of events: read once it's over.
    const end = fileWatcher.watch(watchedPath, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reload, NOTES_SETTLE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      end();
    };
  }, [fileWatcher, watchedPath, reload]);
  const text = loaded.kind === "notes" ? loaded.text : null;
  // Each part rendered once per change of the notes.
  const parts = useMemo<Part[]>(
    () =>
      text === null
        ? []
        : segmentNotes(text).map((segment) =>
            segment.kind === "text"
              ? { kind: "text", html: pipeline.render(segment.markdown) }
              : {
                  kind: "excerpt",
                  excerpt: segment.excerpt,
                  quoteHtml: pipeline.render(segment.quote),
                  note: segment.note,
                  noteHtml: segment.note === "" ? "" : pipeline.render(segment.note),
                },
          ),
    [text, pipeline],
  );
  const excerptCount = parts.filter((part) => part.kind === "excerpt").length;

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

  // Hovering a card outlines its passage on the page.
  const markRef = useRef(onMark);
  markRef.current = onMark;
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    let current: Element | null = null;
    const onOver = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest?.(".excerpt-card") ?? null;
      if (card === current) return;
      current = card;
      const href = card?.querySelector(".excerpt__source a")?.getAttribute("href") ?? null;
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
  }, [passageOf]);
  // The outline goes with the panel.
  useEffect(() => () => markRef.current(null), []);

  // The card actions.
  const placeOf = (excerpt: Excerpt): HighlightPlace | null =>
    excerpt.rect ? { page: excerpt.page, rect: excerpt.rect } : null;
  const report = <T,>(result: Result<T>) => {
    setFailure(result.ok ? null : result.error);
    return result.ok;
  };
  const saveNote = (excerpt: Excerpt) => async (note: string, from: string): Promise<NoteSaved | null> => {
    if (!notesPath) return null;
    const result = await notesService.setNote(notesPath, excerpt.id, note, from);
    if (!report(result)) return null;
    if (result.value.kind === "gone") {
      setFailure("This quote was deleted in another place, so your note on it wasn't saved.");
    }
    return result.value;
  };
  // A deleted quote's highlight goes once Undo is no longer offered.
  const removeHighlightRef = useRef(onRemoveHighlight);
  removeHighlightRef.current = onRemoveHighlight;
  const commitDelete = useCallback((done: Deleted | null) => {
    if (done?.place) removeHighlightRef.current(done.place);
  }, []);
  const deletedRef = useRef(deleted);
  deletedRef.current = deleted;
  const deleteExcerpt = async (excerpt: Excerpt) => {
    if (!notesPath) return;
    const result = await notesService.removeFromNotes(notesPath, excerpt.id);
    reload();
    if (!report(result) || !result.value) return;
    commitDelete(deletedRef.current);
    setDeleted({ removed: result.value, place: placeOf(excerpt) });
  };
  const undoDelete = async () => {
    const done = deleted;
    if (!done) return;
    setDeleted(null);
    report(await notesService.restoreToNotes(done.removed));
    reload();
  };
  useEffect(() => {
    if (!deleted) return;
    const timer = window.setTimeout(() => {
      commitDelete(deleted);
      setDeleted(null);
    }, UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [deleted, commitDelete]);
  // Closing the panel ends the chance to undo.
  useEffect(() => () => commitDelete(deletedRef.current), [commitDelete]);
  const recolor = async (excerpt: Excerpt, color: HighlightColor) => {
    if (!notesPath) return;
    const ok = report(await notesService.setColor(notesPath, excerpt.id, color));
    const place = placeOf(excerpt);
    if (ok && place) onRecolorHighlight(place, color);
    reload();
  };
  const copy = (excerpt: Excerpt) => copyText(quoteToMarkdown(excerpt, excerpt.source));

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
              {notesPath ? fileName(notesPath) : loaded.kind === "no-folder" ? fileName(loaded.notesPath) : "Notes"}
            </span>
            <span className="notes-panel__where">
              {loaded.kind === "none" ? "Made beside the PDF at your first Add to notes" : "Beside the PDF"}
            </span>
          </div>
        </header>
        <NotesBody loaded={loaded} scrollRef={scrollRef}>
          {loaded.kind === "no-folder" && (
            <FolderPrompt
              documentPath={documentPath}
              notesPath={loaded.notesPath}
              asking={asking}
              elsewhere={elsewhere}
              waitingPassage={waitingPassage}
              onAllow={() => void allowFolder()}
            />
          )}
          <article ref={articleRef} className="reader markdown-body notes-panel__notes" hidden={loaded.kind !== "notes"}>
            {parts.map((part, index) =>
              part.kind === "text" ? (
                <Html key={`text-${index}`} className="notes-panel__text" html={part.html} />
              ) : (
                <ExcerptCard
                  key={part.excerpt.id}
                  excerpt={part.excerpt}
                  quoteHtml={part.quoteHtml}
                  note={part.note}
                  noteHtml={part.noteHtml}
                  isNew={part.excerpt.id === newExcerptId}
                  onSaveNote={saveNote(part.excerpt)}
                  onDoneEditing={reload}
                  onDelete={() => void deleteExcerpt(part.excerpt)}
                  onColor={(color) => void recolor(part.excerpt, color)}
                  onCopy={() => copy(part.excerpt)}
                />
              ),
            )}
          </article>
        </NotesBody>
        {(deleted || failure) && (
          <div className="notes-panel__toast" role="status">
            <span>{failure ?? "Quote deleted"}</span>
            {failure ? (
              <button type="button" className="notes-panel__toast-btn" onClick={() => setFailure(null)}>
                OK
              </button>
            ) : (
              <button type="button" className="notes-panel__toast-btn" onClick={() => void undoDelete()}>
                Undo
              </button>
            )}
          </div>
        )}
        <footer className="notes-panel__footer">
          <span>
            {loaded.kind === "notes" ? `${excerptCount} ${excerptCount === 1 ? "quote" : "quotes"} · plain Markdown` : ""}
          </span>
          {loaded.kind === "notes" && (
            <button className="notes-panel__open" onClick={() => onOpenFile(loaded.notesPath)} title="Open the whole notes file in a tab">
              Open as tab ↗
            </button>
          )}
        </footer>
      </aside>
    </FileLinkContext.Provider>
  );
}

/**
 * Why the notes can't be shown yet, and the way through: iPadOS gave the app the PDF, not
 * its folder, so the folder is asked for once (or a folder above it, for many papers).
 */
function FolderPrompt({
  documentPath,
  notesPath,
  asking,
  elsewhere,
  waitingPassage,
  onAllow,
}: {
  documentPath: string;
  notesPath: string;
  asking: boolean;
  elsewhere: boolean;
  waitingPassage: boolean;
  onAllow: () => void;
}) {
  const folder = folderNameOf(documentPath) || "its folder";
  return (
    <div className="notes-panel__empty notes-panel__access">
      <p className="notes-panel__empty-title">Allow the folder for your notes</p>
      <p>
        Your notes are kept in <strong>{fileName(notesPath)}</strong>, beside the PDF in “{folder}”. iPadOS
        asks you to allow that folder once.
      </p>
      {waitingPassage && (
        <p>Your highlight is saved. The passage goes into your notes as soon as the folder is allowed.</p>
      )}
      <button type="button" className="notes-panel__allow" onClick={onAllow} disabled={asking}>
        Allow “{folder}”…
      </button>
      {elsewhere ? (
        <p className="notes-panel__hint" role="alert">
          That folder doesn't hold this PDF. Choose “{folder}”, or a folder above it.
        </p>
      ) : (
        <p className="notes-panel__hint">
          Files opens at “{folder}”: tap <strong>Open</strong>. To allow all your papers at once, go up to
          a folder that holds them first.
        </p>
      )}
    </div>
  );
}

/** The notes, or what to say when there are none. */
function NotesBody({
  loaded,
  scrollRef,
  children,
}: {
  loaded: Loaded;
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
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
            highlighted on the page and quoted here, ready for your note on it.
          </p>
        </div>
      )}
      {loaded.kind === "error" && (
        <p className="notes-panel__empty" role="alert">
          {loaded.message}
        </p>
      )}
      {children}
    </div>
  );
}
