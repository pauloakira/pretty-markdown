import { useEffect, useState } from "react";
import type { HighlightColor } from "../../domain/values/Highlight";
import type { EditHistory, HighlightAvailability, PdfTool } from "../pdf/PdfViewer";
import { HighlightControl } from "./HighlightControl";

interface PdfToolbarProps {
  name: string;
  /** PDF metadata title, shown as the name's tooltip. */
  title: string | null;
  /** Null until the document has loaded. */
  pageCount: number | null;
  page: number;
  /** Effective zoom as a percentage, e.g. 125. */
  zoomPercent: number;
  fitWidth: boolean;
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  /** Null until the document has loaded. */
  highlighting: HighlightAvailability | null;
  tool: PdfTool;
  highlightColor: HighlightColor;
  onToolChange: (tool: PdfTool) => void;
  onHighlightColorChange: (color: HighlightColor) => void;
  history: EditHistory;
  onUndo: () => void;
  onRedo: () => void;
}

/** Toolbar for a PDF tab: the highlighter, page indicator with go-to-page, and zoom. */
export function PdfToolbar({
  name,
  title,
  pageCount,
  page,
  zoomPercent,
  fitWidth,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  highlighting,
  tool,
  highlightColor,
  onToolChange,
  onHighlightColorChange,
  history,
  onUndo,
  onRedo,
}: PdfToolbarProps) {
  const ready = pageCount !== null;
  // The field shows the current page until the user types; Enter jumps, Escape/blur reverts.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [page]);

  const commit = () => {
    const target = Number.parseInt(draft ?? "", 10);
    if (Number.isFinite(target)) onGoToPage(target);
    setDraft(null);
  };

  return (
    <div className="doctoolbar">
      <span className="doctoolbar__name" title={title ?? undefined}>
        {name}
      </span>
      <div className="doctoolbar__actions">
        <HighlightControl
          availability={highlighting}
          tool={tool}
          color={highlightColor}
          onToolChange={onToolChange}
          onColorChange={onHighlightColorChange}
        />
        {highlighting?.allowed && (
          <div className="segmented" role="group" aria-label="Highlight history">
            <button
              className="segmented__btn pdftoolbar__history-btn"
              onClick={onUndo}
              disabled={!history.canUndo}
              aria-label="Undo"
              title="Undo highlight change (⌘Z)"
            >
              ↶
            </button>
            <button
              className="segmented__btn pdftoolbar__history-btn"
              onClick={onRedo}
              disabled={!history.canRedo}
              aria-label="Redo"
              title="Redo (⌘⇧Z)"
            >
              ↷
            </button>
          </div>
        )}
        <label className="pdftoolbar__page" title="Go to page">
          <input
            className="pdftoolbar__page-input"
            aria-label="Page"
            inputMode="numeric"
            disabled={!ready}
            value={draft ?? (ready ? String(page) : "")}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            onFocus={(e) => e.target.select()}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
          />
          <span className="pdftoolbar__page-count">/ {ready ? pageCount : "–"}</span>
        </label>
        <div className="segmented" role="group" aria-label="Zoom">
          <button
            className="segmented__btn"
            onClick={onZoomOut}
            disabled={!ready}
            aria-label="Zoom out"
            title="Zoom out (⌘−)"
          >
            −
          </button>
          <span className="pdftoolbar__zoom" aria-live="polite">
            {ready ? `${zoomPercent}%` : "–"}
          </span>
          <button
            className="segmented__btn"
            onClick={onZoomIn}
            disabled={!ready}
            aria-label="Zoom in"
            title="Zoom in (⌘+)"
          >
            +
          </button>
        </div>
        <button
          className={`doctoolbar__btn${fitWidth ? " doctoolbar__btn--on" : ""}`}
          onClick={onFitWidth}
          disabled={!ready}
          aria-pressed={fitWidth}
          title="Fit to width (⌘0)"
        >
          Fit width
        </button>
      </div>
    </div>
  );
}
