import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isTabDirty, type Tab, type TabId } from "../../domain/entities/Tab";

interface TabBarProps {
  tabs: readonly Tab[];
  activeTabId: TabId | null;
  busy: boolean;
  onSelect: (id: TabId) => void;
  onClose: (id: TabId) => void;
  onNew: () => void;
  onDrop: (id: TabId, gap: number) => void;
  onOpenSettings: () => void;
}

const DRAG_THRESHOLD = 5;

interface DragState {
  id: TabId;
  startX: number;
  pointerId: number;
  dragging: boolean;
}

/**
 * Tab bar with pointer-based drag-to-reorder. We use pointer events (not HTML5 drag,
 * which is unreliable in WKWebView): press-and-move past a threshold starts a drag, an
 * insertion marker follows the cursor, and release commits via `onReorder`.
 */
export function TabBar({
  tabs,
  activeTabId,
  busy,
  onSelect,
  onClose,
  onNew,
  onDrop,
  onOpenSettings,
}: TabBarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragId, setDragId] = useState<TabId | null>(null);
  const [gap, setGap] = useState<number | null>(null);

  /** Insertion gap (0..tabs.length) for a pointer x, by tab midpoints. */
  const gapAt = (clientX: number): number => {
    const list = listRef.current;
    if (!list) return tabs.length;
    const els = Array.from(list.querySelectorAll<HTMLElement>("[data-tab-id]"));
    for (let i = 0; i < els.length; i += 1) {
      const r = els[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return els.length;
  };

  const onTabPointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: TabId) => {
    if (e.button === 1) {
      onClose(id);
      return;
    }
    if (e.button !== 0) return;
    onSelect(id); // activate on press, like a browser
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, startX: e.clientX, pointerId: e.pointerId, dragging: false };
  };

  const onTabPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.dragging) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return;
      drag.dragging = true;
      setDragId(drag.id);
    }
    setGap(gapAt(e.clientX));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone
    }
    if (drag?.dragging && gap !== null) onDrop(drag.id, gap);
    setDragId(null);
    setGap(null);
  };

  return (
    <div className="tabbar">
      <div className="tabbar__list" ref={listRef}>
        {tabs.map((tab, index) => {
          const className = [
            "tab",
            tab.id === activeTabId ? "tab--active" : "",
            tab.id === dragId ? "tab--dragging" : "",
            dragId !== null && gap === index ? "tab--insert-before" : "",
            dragId !== null && gap === tabs.length && index === tabs.length - 1
              ? "tab--insert-after"
              : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={className}
              title={tab.document.path ?? tab.document.name}
              onPointerDown={(e) => onTabPointerDown(e, tab.id)}
              onPointerMove={onTabPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className="tab__name">{tab.document.name}</span>
              {isTabDirty(tab) && <span className="tab__dirty" aria-label="Unsaved changes">●</span>}
              <button
                className="tab__close"
                aria-label="Close tab"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="tabbar__new"
        aria-label="Open a document in a new tab"
        onClick={onNew}
        disabled={busy}
      >
        +
      </button>
      <button
        className="tabbar__settings"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
      >
        ⚙
      </button>
    </div>
  );
}
