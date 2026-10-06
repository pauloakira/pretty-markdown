import { useEffect, useState } from "react";

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
}

/** Toolbar for a PDF tab: page indicator with go-to-page, and zoom controls. */
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
