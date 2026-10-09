import { useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  HIGHLIGHT_COLORS,
  highlightHex,
  type HighlightColor,
} from "../../domain/values/Highlight";
import { usePopoverDismiss } from "../hooks/usePopoverDismiss";
import type { HighlightAvailability, PdfTool } from "../pdf/PdfViewer";

interface HighlightControlProps {
  /** Null until the document has loaded. */
  availability: HighlightAvailability | null;
  tool: PdfTool;
  color: HighlightColor;
  onToolChange: (tool: PdfTool) => void;
  onColorChange: (color: HighlightColor) => void;
}

/**
 * The PDF toolbar's highlighter: a toggle for highlight mode (every selection gets
 * highlighted) showing the current colour, and a menu to pick the colour. Disabled, with
 * the reason as its tooltip, for PDFs that can't be highlighted.
 */
export function HighlightControl({
  availability,
  tool,
  color,
  onToolChange,
  onColorChange,
}: HighlightControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const allowed = availability?.allowed === true;
  const on = allowed && tool === "highlight";
  const tooltip =
    availability && !availability.allowed
      ? availability.reason
      : on
        ? "Stop highlighting (⌘⇧H or Esc)"
        : "Highlight: every text selection gets highlighted (⌘⇧H)";

  return (
    <div className="pdftoolbar__highlight" ref={rootRef}>
      <div className="segmented" role="group" aria-label="Highlighter">
        <button
          className={`segmented__btn pdftoolbar__highlight-btn${on ? " segmented__btn--active" : ""}`}
          onClick={() => onToolChange(on ? "select" : "highlight")}
          disabled={!allowed}
          aria-pressed={on}
          title={tooltip}
        >
          <span
            className="pdftoolbar__swatch"
            style={{ background: highlightHex(color) }}
            aria-hidden="true"
          />
          Highlight
        </button>
        <button
          className="segmented__btn pdftoolbar__color-btn"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={!allowed}
          aria-label="Highlight colour"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Highlight colour"
        >
          ▾
        </button>
      </div>
      {menuOpen && (
        <ColorMenu
          rootRef={rootRef}
          color={color}
          onPick={(picked) => {
            onColorChange(picked);
            setMenuOpen(false);
          }}
          onDismiss={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The colour menu. A component of its own so its dismiss listeners (which swallow Escape)
 * only exist while it's open: otherwise Escape couldn't leave highlight mode.
 */
function ColorMenu({
  rootRef,
  color,
  onPick,
  onDismiss,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  color: HighlightColor;
  onPick: (color: HighlightColor) => void;
  onDismiss: () => void;
}) {
  // The whole control counts as inside, so the ▾ button toggles instead of reopening.
  usePopoverDismiss(rootRef, onDismiss);
  return (
    <div className="popmenu pdftoolbar__colors" role="menu" aria-label="Highlight colours">
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c.name}
          className={`pdftoolbar__color${c.name === color ? " pdftoolbar__color--on" : ""}`}
          style={{ "--highlight-color": c.hex } as CSSProperties}
          role="menuitemradio"
          aria-checked={c.name === color}
          aria-label={c.label}
          title={c.label}
          onClick={() => onPick(c.name)}
        />
      ))}
    </div>
  );
}
