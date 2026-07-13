import { useState, type MouseEvent } from "react";
import { isTabDirty, type Tab, type TabId } from "../../domain/entities/Tab";

interface TabBarProps {
  tabs: readonly Tab[];
  activeTabId: TabId | null;
  busy: boolean;
  onSelect: (id: TabId) => void;
  onClose: (id: TabId) => void;
  onNew: () => void;
  onReorder: (id: TabId, toIndex: number) => void;
  onOpenSettings: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  busy,
  onSelect,
  onClose,
  onNew,
  onReorder,
  onOpenSettings,
}: TabBarProps) {
  const [dragId, setDragId] = useState<TabId | null>(null);
  const [overId, setOverId] = useState<TabId | null>(null);

  const handleClose = (e: MouseEvent, id: TabId) => {
    e.stopPropagation();
    onClose(id);
  };

  return (
    <div className="tabbar">
      <div className="tabbar__list">
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId;
          const className = [
            "tab",
            active ? "tab--active" : "",
            tab.id === dragId ? "tab--dragging" : "",
            overId === tab.id && dragId !== tab.id ? "tab--dragover" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={tab.id}
              className={className}
              title={tab.document.path ?? tab.document.name}
              onClick={() => onSelect(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) handleClose(e, tab.id); // middle-click closes
              }}
              draggable
              onDragStart={(e) => {
                setDragId(tab.id);
                // WKWebView needs data set on the transfer for the drag to start.
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", tab.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overId !== tab.id) setOverId(tab.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== tab.id) onReorder(dragId, index);
                setDragId(null);
                setOverId(null);
              }}
            >
              <span className="tab__name">{tab.document.name}</span>
              {isTabDirty(tab) && <span className="tab__dirty" aria-label="Unsaved changes">●</span>}
              <button
                className="tab__close"
                aria-label="Close tab"
                onClick={(e) => handleClose(e, tab.id)}
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
