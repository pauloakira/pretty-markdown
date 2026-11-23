import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
} from "../../domain/values/Highlight";
import type { ScreenBox } from "../pdf/PdfViewer";

/** Space between the selection and the popover, and from the stage's edges (px). */
const GAP_PX = 8;
/** How long "Copied" (or "Couldn't copy") shows on Copy as quote. */
const COPIED_MS = 1500;

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
  /** Add to notes: the passage is quoted, and its note opens in the Notes panel. */
  onAddToNotes: () => void;
  /** Copy the passage as a Markdown quote; resolves to whether it worked. */
  onCopy: () => Promise<boolean>;
  /** Escape: hide the popover (the selection stays). */
  onDismiss: () => void;
}

/**
 * Actions by a selection in a PDF (docs/RESEARCH_READER.md): highlight it in a colour, Add
 * to notes (⌘E), Copy as quote. Notes on a quote are written in the Notes panel.
 * Shown on the Mac; the iPad keeps pdf.js's Highlight button and the system's menu.
 */
export function SelectionPopover({
  bounds,
  stageRef,
  canHighlight,
  color,
  onHighlight,
  onAddToNotes,
  onCopy,
  onDismiss,
}: SelectionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null,
  );
  // What Copy as quote did, said on its button for a moment.
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);

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
    const left = Math.max(
      GAP_PX,
      Math.min(centre - width / 2, stage.width - width - GAP_PX),
    );
    const above = bounds.top - stage.top - height - GAP_PX;
    const below = bounds.bottom - stage.top + GAP_PX;
    const top =
      above >= GAP_PX || below + height > stage.height - GAP_PX
        ? Math.max(GAP_PX, above)
        : below;
    setPlace({ left, top });
  }, [bounds, stageRef]);

  useEffect(() => {
    if (copied === null) return;
    const timer = window.setTimeout(() => setCopied(null), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // Escape hides the popover.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      className="selection-popover"
      style={
        place ? { left: place.left, top: place.top } : { visibility: "hidden" }
      }
      role="toolbar"
      aria-label="Selection"
      // Keep the text selection: a press on the popover would otherwise clear it.
      onMouseDown={(event) => event.preventDefault()}
    >
      {canHighlight && (
        <>
          <div
            className="selection-popover__colours"
            role="group"
            aria-label="Highlight"
          >
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
        title="Highlight this, quote it in the notes, and write a note on it"
      >
        Add to notes <kbd className="selection-popover__key">⌘E</kbd>
      </button>
      <button
        type="button"
        className="selection-popover__btn"
        onClick={() =>
          void onCopy().then((done) => setCopied(done ? "copied" : "failed"))
        }
        title="Copy as a Markdown quote, with a link to its page"
      >
        {copied === "copied"
          ? "Copied"
          : copied === "failed"
            ? "Couldn't copy"
            : "Copy as quote"}
      </button>
    </div>
  );
}
