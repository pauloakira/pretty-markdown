import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { filterOutline, pathTo, type OutlineItem } from "../../domain/values/Outline";
import { CONTENTS_WIDTH } from "../../domain/values/Settings";
import { useMediaQuery } from "../hooks/useMediaQuery";

/**
 * On an iPad held upright the sidebar slides over the page instead of narrowing it; picking
 * a section closes it.
 */
export const CONTENTS_OVERLAY_QUERY = "(pointer: coarse) and (orientation: portrait)";

/** The sidebar's open state and width (app settings), and how to change them. */
export interface ContentsPanel {
  readonly open: boolean;
  readonly widthPx: number;
  setOpen(open: boolean): void;
  setWidth(px: number): void;
}

interface ContentsSidebarProps {
  /** Null while it's being read. */
  outline: readonly OutlineItem[] | null;
  /** The section the reader is in. */
  currentId: string | null;
  /** Show each item's page number (PDFs). */
  showPages: boolean;
  /** What to say when the document has no outline. */
  emptyMessage: string;
  /** Where the outline comes from, shown at the bottom. */
  sourceLabel: string;
  panel: ContentsPanel;
  onSelect: (item: OutlineItem) => void;
}

/**
 * The contents sidebar: the document's chapters and sections as a tree. Chapters start
 * collapsed except the one being read, which opens as the reader moves through the
 * document. The filter narrows the tree to matching sections (all expanded).
 */
export function ContentsSidebar({ outline, currentId, showPages, emptyMessage, sourceLabel, panel, onSelect }: ContentsSidebarProps) {
  const overlay = useMediaQuery(CONTENTS_OVERLAY_QUERY);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Open the chapters around the current section (never closing what the reader opened).
  const currentPath = useMemo(() => (outline && currentId ? pathTo(outline, currentId) : []), [outline, currentId]);
  useEffect(() => {
    const ancestors = currentPath.slice(0, -1);
    if (ancestors.length === 0) return;
    setExpanded((open) => (ancestors.every((id) => open.has(id)) ? open : new Set([...open, ...ancestors])));
  }, [currentPath]);

  const filtering = query.trim() !== "";
  const visible = useMemo(() => (outline ? filterOutline(outline, query) : []), [outline, query]);

  // The row to mark: the current section, or the closest chapter around it still shown.
  const marked = useMemo(() => {
    if (filtering) return currentId;
    for (let i = currentPath.length - 1; i > 0; i -= 1) {
      if (currentPath.slice(0, i).every((id) => expanded.has(id))) return currentPath[i];
    }
    return currentPath[0] ?? null;
  }, [filtering, currentId, currentPath, expanded]);

  // Keep the marked row in view as the reader moves on.
  useEffect(() => {
    if (!marked) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-outline-id="${CSS.escape(marked)}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [marked]);

  const toggle = (id: string) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const select = (item: OutlineItem) => {
    if (item.position === null) return;
    onSelect(item);
    if (overlay) panel.setOpen(false);
  };

  const rows: ReactElement[] = [];
  const addRows = (items: readonly OutlineItem[], depth: number) => {
    for (const item of items) {
      const hasChildren = item.children.length > 0;
      const isOpen = filtering || expanded.has(item.id);
      rows.push(
        <div
          key={item.id}
          className={`contents__row${item.id === marked ? " contents__row--current" : ""}`}
          style={{ paddingLeft: `${0.35 + depth * 0.9}rem` }}
          data-outline-id={item.id}
        >
          {hasChildren ? (
            <button
              className="contents__twisty"
              aria-label={isOpen ? `Collapse ${item.title}` : `Expand ${item.title}`}
              aria-expanded={isOpen}
              onClick={() => toggle(item.id)}
              disabled={filtering}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true" className={isOpen ? "contents__chevron--open" : ""}>
                <path d="M3.5 2 L7 5 L3.5 8" />
              </svg>
            </button>
          ) : (
            <span className="contents__twisty" aria-hidden="true" />
          )}
          <button
            className="contents__item"
            onClick={() => select(item)}
            disabled={item.position === null}
            title={item.title}
            aria-current={item.id === marked ? "location" : undefined}
          >
            {item.html ? (
              // Rendered by the app's own markdown pipeline (raw HTML is disabled there).
              <span className="contents__title" dangerouslySetInnerHTML={{ __html: item.html }} />
            ) : (
              <span className="contents__title">{item.title}</span>
            )}
            {showPages && item.position !== null && <span className="contents__page">{Math.floor(item.position) + 1}</span>}
          </button>
        </div>,
      );
      if (hasChildren && isOpen) addRows(item.children, depth + 1);
    }
  };
  addRows(visible, 0);

  // Drag the right edge to resize (Mac; the overlay has a fixed width).
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel.widthPx;
    // One width change per frame: each one re-fits the page beside the sidebar.
    let frame = 0;
    let width = startWidth;
    const onMove = (move: PointerEvent) => {
      width = Math.min(CONTENTS_WIDTH.max, Math.max(CONTENTS_WIDTH.min, Math.round(startWidth + move.clientX - startX)));
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        panel.setWidth(width);
      });
    };
    const onUp = () => {
      cancelAnimationFrame(frame);
      panel.setWidth(width);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <>
      {overlay && <div className="contents-scrim" onClick={() => panel.setOpen(false)} />}
      <nav
        className={`contents${overlay ? " contents--overlay" : ""}`}
        style={overlay ? undefined : { width: panel.widthPx }}
        aria-label="Contents"
      >
        <div className="contents__header">
          <input
            className="contents__filter"
            type="search"
            placeholder="Filter sections"
            aria-label="Filter sections"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="contents__tool"
            onClick={() => setExpanded(new Set())}
            title="Collapse all"
            aria-label="Collapse all"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6 L8 3 L12 6 M4 10 L8 13 L12 10" />
            </svg>
          </button>
          {overlay && (
            <button className="contents__tool" onClick={() => panel.setOpen(false)} title="Close" aria-label="Close contents">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4 L12 12 M12 4 L4 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="contents__list" ref={listRef}>
          {outline === null ? (
            <p className="contents__note">Reading the contents…</p>
          ) : outline.length === 0 ? (
            <p className="contents__note">{emptyMessage}</p>
          ) : rows.length === 0 ? (
            <p className="contents__note">No sections match.</p>
          ) : (
            rows
          )}
        </div>
        <div className="contents__footer">{sourceLabel}</div>
        {!overlay && <div className="contents__resize" onPointerDown={startResize} aria-hidden="true" />}
      </nav>
    </>
  );
}

/** The toolbar button that shows or hides the contents (⌘⇧L). */
export function ContentsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      className={`doctoolbar__btn doctoolbar__icon-btn${open ? " doctoolbar__btn--on" : ""}`}
      onClick={onToggle}
      title={open ? "Hide contents (⌘⇧L)" : "Show contents (⌘⇧L)"}
      aria-label="Contents"
      aria-pressed={open}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <path d="M6 2.5 V13.5 M3 5.5 H4.5 M3 8 H4.5 M3 10.5 H4.5" />
      </svg>
    </button>
  );
}
