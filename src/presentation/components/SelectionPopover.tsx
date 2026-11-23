import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { HIGHLIGHT_COLORS, type HighlightColor } from "../../domain/values/Highlight";
import type { ScreenBox } from "../pdf/PdfViewer";

/** Space between the selection and the popover, and from the stage's edges (px). */
const GAP_PX = 8;
/** How long "Copied" shows on Copy as quote. */
const COPIED_MS = 1500;
/** How long after the comment field opens it takes the focus back (see below). */
const FOCUS_CLAIM_MS = 500;

interface SelectionPopoverProps {
  /** Where the selection is on screen; the popover goes above it (below, if no room). */
  bounds: ScreenBox;
  /** The element the popover is placed in (positioned, and clipping it). */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Whether this PDF can be highlighted (signed or locked ones can't): the colours. */
  canHighlight: boolean;
  /** The highlighter colour, marked among the colours. */
  color: HighlightColor;
  onHighlight: (color: HighlightColor) => void;
  onAddToNotes: () => void;
  /** Comment was chosen: the passage is highlighted, and the comment field opens. */
  onComment: () => void;
  /** Writing a comment (the field is open). */
  commenting: boolean;
  onSubmitComment: (comment: string) => void;
  onCancelComment: () => void;
  /** Copy the passage as a Markdown quote; resolves to whether it worked. */
  onCopy: () => Promise<boolean>;
  /** Escape: hide the popover (the selection stays). */
  onDismiss: () => void;
}

/**
 * Actions by a selection in a PDF (docs/RESEARCH_READER.md): highlight it in a colour, Add
 * to notes (⌘E), Comment (add it with a comment of the reader's own), Copy as quote.
 * Shown on the Mac; the iPad keeps pdf.js's Highlight button and the system's menu.
 */
export function SelectionPopover({
  bounds,
  stageRef,
  canHighlight,
  color,
  onHighlight,
  onAddToNotes,
  onComment,
  commenting,
  onSubmitComment,
  onCancelComment,
  onCopy,
  onDismiss,
}: SelectionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [comment, setComment] = useState("");

  // Above the selection, centred on it and kept inside the stage; below it when there's
  // no room above. Hidden while the selection is scrolled out of view.
  useLayoutEffect(() => {
    const stage = stageRef.current?.getBoundingClientRect();
    const own = ref.current;
    if (!stage || !own) return;
    const width = own.offsetWidth;
    const height = own.offsetHeight;
    if (bounds.bottom < stage.top || bounds.top > stage.bottom) {
      setPlace(null);
      return;
    }
    const centre = (bounds.left + bounds.right) / 2 - stage.left;
    const left = Math.max(GAP_PX, Math.min(centre - width / 2, stage.width - width - GAP_PX));
    const above = bounds.top - stage.top - height - GAP_PX;
    const below = bounds.bottom - stage.top + GAP_PX;
    const top = above >= GAP_PX || below + height > stage.height - GAP_PX ? Math.max(GAP_PX, above) : below;
    setPlace({ left, top });
  }, [bounds, stageRef, commenting]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // Escape hides the popover, or puts the comment away.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (commenting) onCancelComment();
      else onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commenting, onCancelComment, onDismiss]);

  // The comment field takes the focus once the popover is placed (hidden, while it's
  // measured, it can't). Should anything else take it in the next moments (pdf.js focuses
  // the highlight it has just made), it comes back to the field.
  const placed = place !== null;
  useEffect(() => {
    if (!commenting || !placed) return;
    const field = () => ref.current?.querySelector("textarea") ?? null;
    field()?.focus();
    const onFocusIn = (event: FocusEvent) => {
      if (!ref.current?.contains(event.target as Node)) field()?.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    const timer = window.setTimeout(() => document.removeEventListener("focusin", onFocusIn), FOCUS_CLAIM_MS);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [commenting, placed]);

  // Clicking elsewhere while commenting: nothing written yet means never mind; something
  // written is kept, so it isn't lost to a stray click.
  const commentRef = useRef(comment);
  commentRef.current = comment;
  useEffect(() => {
    if (!commenting) return;
    const onPress = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      if (commentRef.current.trim() === "") onCancelComment();
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [commenting, onCancelComment]);

  return (
    <div
      ref={ref}
      className={`selection-popover${commenting ? " selection-popover--commenting" : ""}`}
      style={place ? { left: place.left, top: place.top } : { visibility: "hidden" }}
      role="toolbar"
      aria-label="Selection"
      // Keep the text selection: a press on the popover would otherwise clear it.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) event.preventDefault();
      }}
    >
      {commenting ? (
        <form
          className="selection-popover__comment"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitComment(comment);
          }}
        >
          <textarea
            className="selection-popover__field"
            aria-label="Comment"
            placeholder="Your comment, in Markdown…"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSubmitComment(comment);
              }
            }}
          />
          <div className="selection-popover__row">
            <span className="selection-popover__hint">↩ add · ⇧↩ new line</span>
            <button type="button" className="selection-popover__btn" onClick={onCancelComment}>
              Cancel
            </button>
            <button type="submit" className="selection-popover__btn selection-popover__btn--primary">
              Add to notes
            </button>
          </div>
        </form>
      ) : (
        <>
          {canHighlight && (
            <>
              <div className="selection-popover__colours" role="group" aria-label="Highlight">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className={`selection-popover__colour${c.name === color ? " selection-popover__colour--chosen" : ""}`}
                    style={{ background: c.hex }}
                    onClick={() => onHighlight(c.name)}
                    aria-label={`Highlight ${c.label.toLowerCase()}`}
                    aria-pressed={c.name === color}
                    title={`Highlight in ${c.label.toLowerCase()}`}
                  />
                ))}
              </div>
              <span className="selection-popover__divider" aria-hidden="true" />
            </>
          )}
          <button
            type="button"
            className="selection-popover__btn selection-popover__btn--primary"
            onClick={onAddToNotes}
            title="Highlight this and quote it in the notes"
          >
            Add to notes <kbd className="selection-popover__key">⌘E</kbd>
          </button>
          <button
            type="button"
            className="selection-popover__btn"
            onClick={onComment}
            title="Add this to the notes with a comment of your own"
          >
            Comment
          </button>
          <button
            type="button"
            className="selection-popover__btn"
            onClick={() => void onCopy().then(setCopied)}
            title="Copy as a Markdown quote, with a link to its page"
          >
            {copied ? "Copied" : "Copy as quote"}
          </button>
        </>
      )}
    </div>
  );
}
