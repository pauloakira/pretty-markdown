import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Excerpt } from "../../domain/values/Excerpt";
import { HIGHLIGHT_COLORS, type HighlightColor } from "../../domain/values/Highlight";

/** Quiet period after the last keystroke before a note is saved. */
const SAVE_AFTER_MS = 400;
/** How long a quote just added keeps the focus in its note (see below). */
const FOCUS_CLAIM_MS = 600;
/** How long "Copied" shows. */
const COPIED_MS = 1500;

interface ExcerptCardProps {
  excerpt: Excerpt;
  /** The quote, rendered (an excerpt block). */
  quoteHtml: string;
  /** The reader's note on it: its Markdown, and rendered. */
  note: string;
  noteHtml: string;
  /** Just added: open its note to write in, take the focus, and mark it for a moment. */
  isNew: boolean;
  /** Save the note (called as the reader types, and when they finish). */
  onSaveNote: (note: string) => Promise<void>;
  /** The reader finished writing: read the notes again. */
  onDoneEditing: () => void;
  onDelete: () => void;
  onColor: (color: HighlightColor) => void;
  /** Copy the quote; resolves to whether it worked. */
  onCopy: () => Promise<boolean>;
}

/**
 * One excerpt in the Notes panel (docs/RESEARCH_READER.md): the quote, its link back to
 * the page, and the reader's note on it, as one card. The note is written in place and
 * saved as the reader types; the card's menu recolours, copies or deletes it.
 */
export function ExcerptCard({
  excerpt,
  quoteHtml,
  note,
  noteHtml,
  isNew,
  onSaveNote,
  onDoneEditing,
  onDelete,
  onColor,
  onCopy,
}: ExcerptCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState(note);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);

  // Saving: shortly after the last keystroke, and right away when the reader is done.
  const saved = useRef(note);
  const timer = useRef(0);
  const saveNow = (text: string) => {
    window.clearTimeout(timer.current);
    if (text === saved.current) return Promise.resolve();
    saved.current = text;
    return onSaveNote(text);
  };
  const change = (text: string) => {
    setDraft(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveNow(text), SAVE_AFTER_MS);
  };
  const finish = () => {
    if (!editing) return;
    setEditing(false);
    void saveNow(draft).then(onDoneEditing);
  };
  // Leaving the panel mid-sentence still saves.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(
    () => () => {
      if (draftRef.current !== saved.current) void onSaveNote(draftRef.current);
      window.clearTimeout(timer.current);
    },
    // Only on unmount: `onSaveNote` writes this card's note whichever render it's from.
    [],
  );

  const startEditing = () => {
    setDraft(note);
    saved.current = note;
    setEditing(true);
  };

  // The field grows with its text.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [draft, editing]);

  // Opening the note puts the caret at its end.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!editing || !field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [editing]);

  // A quote just added: bring it into view, mark it, and keep the focus in its note.
  // pdf.js focuses the highlight it has just made a moment later; for a short while
  // focus going elsewhere comes back to the note.
  useEffect(() => {
    const card = cardRef.current;
    if (!isNew || !card) return;
    const scroll = card.closest<HTMLElement>(".notes-panel__scroll");
    if (scroll) {
      // By hand: `scrollIntoView` doesn't move nested overflow in WKWebView.
      const offset = card.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      if (offset < 0 || offset + card.offsetHeight > scroll.clientHeight) {
        scroll.scrollTop = Math.max(0, scroll.scrollTop + offset - scroll.clientHeight / 3);
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!card.contains(event.target as Node)) fieldRef.current?.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    const done = window.setTimeout(() => document.removeEventListener("focusin", onFocusIn), FOCUS_CLAIM_MS);
    return () => {
      window.clearTimeout(done);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [isNew]);

  useEffect(() => {
    if (copied === null) return;
    const done = window.setTimeout(() => setCopied(null), COPIED_MS);
    return () => window.clearTimeout(done);
  }, [copied]);

  return (
    <section
      ref={cardRef}
      className={`excerpt-card${isNew ? " excerpt-card--new" : ""}${editing ? " excerpt-card--editing" : ""}`}
      data-card={excerpt.id}
      aria-label={`Quote from p. ${excerpt.page}`}
    >
      <Html className="excerpt-card__quote" html={quoteHtml} />
      <div className="excerpt-card__menu" role="toolbar" aria-label="Quote">
        {picking ? (
          <div className="excerpt-card__colours" role="group" aria-label="Colour">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                className={`excerpt-card__colour${c.name === excerpt.color ? " excerpt-card__colour--chosen" : ""}`}
                style={{ background: c.hex }}
                aria-label={c.label}
                aria-pressed={c.name === excerpt.color}
                onClick={() => {
                  setPicking(false);
                  if (c.name !== excerpt.color) onColor(c.name);
                }}
              />
            ))}
          </div>
        ) : (
          <>
            <button type="button" className="excerpt-card__action" aria-label="Colour" title="Colour" onClick={() => setPicking(true)}>
              <span className="excerpt-card__swatch" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="excerpt-card__action"
              aria-label={copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}
              title={copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy as a Markdown quote"}
              onClick={() => void onCopy().then((ok) => setCopied(ok ? "copied" : "failed"))}
            >
              {copied === "copied" ? <CheckIcon /> : <CopyIcon />}
            </button>
            <button
              type="button"
              className="excerpt-card__action excerpt-card__action--danger"
              aria-label="Delete"
              title="Delete the quote, its note and its highlight"
              onClick={onDelete}
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>
      {editing ? (
        <div className="excerpt-card__note excerpt-card__note--editing">
          <textarea
            ref={fieldRef}
            className="excerpt-card__field"
            aria-label="Note"
            placeholder="Write a note on this quote…"
            rows={1}
            value={draft}
            onChange={(event) => change(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
                event.preventDefault();
                event.stopPropagation();
                fieldRef.current?.blur();
              }
            }}
          />
          <p className="excerpt-card__hint">Saved as you type · Esc to finish</p>
        </div>
      ) : note.trim() !== "" ? (
        <div
          className="excerpt-card__note"
          onClick={(event) => {
            // Links in the note still work as links.
            if (!(event.target as Element).closest("a")) startEditing();
          }}
          title="Edit the note"
        >
          <PencilIcon />
          <Html className="excerpt-card__note-text" html={noteHtml} />
        </div>
      ) : (
        <button type="button" className="excerpt-card__note excerpt-card__add" onClick={startEditing}>
          <PencilIcon />
          <span>Add a note</span>
        </button>
      )}
    </section>
  );
}

/** Rendered Markdown, set imperatively (as the reader does), only when it changes. */
export function Html({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
  }, [html]);
  return <div ref={ref} className={className} />;
}

const iconProps = {
  viewBox: "0 0 16 16",
  width: 14,
  height: 14,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function PencilIcon() {
  return (
    <svg {...iconProps} className="excerpt-card__icon">
      <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
      <path d="M9 4l3 3" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg {...iconProps}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.5 4.5h11M6.5 4.5v-2h3v2M4 4.5l.7 9h6.6l.7-9" />
    </svg>
  );
}
