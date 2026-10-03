import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Tab } from "../../domain/entities/Tab";
import type { GroupId, TabGroup } from "../../domain/entities/TabGroup";
import { clampToViewport, usePopoverDismiss } from "../hooks/usePopoverDismiss";

interface TabContextMenuProps {
  x: number;
  y: number;
  tab: Tab;
  groups: readonly TabGroup[];
  /** Number of tabs in each group, shown in the submenu. */
  groupSizes: Readonly<Record<GroupId, number>>;
  canCloseOthers: boolean;
  onNewGroup: () => void;
  onAddToGroup: (groupId: GroupId) => void;
  onRemoveFromGroup: () => void;
  onGroupByFolder: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onDismiss: () => void;
}

/**
 * Right-click menu for a tab. "Add tab to group" opens a submenu of the other groups,
 * flipped to the left when there's no room on the right.
 */
export function TabContextMenu({
  x,
  y,
  tab,
  groups,
  groupSizes,
  canCloseOthers,
  onNewGroup,
  onAddToGroup,
  onRemoveFromGroup,
  onGroupByFolder,
  onCloseTab,
  onCloseOthers,
  onDismiss,
}: TabContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ left: x, top: y, visibility: "hidden" });
  const [subOpen, setSubOpen] = useState(false);
  const [subStyle, setSubStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const dismiss = useCallback(() => onDismiss(), [onDismiss]);
  usePopoverDismiss(rootRef, dismiss);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    setPosition(clampToViewport(x, y, el.offsetWidth, el.offsetHeight));
  }, [x, y]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const sub = subRef.current;
    const trigger = menu?.querySelector<HTMLElement>("[data-submenu-trigger]");
    if (!subOpen || !menu || !sub || !trigger) return;
    const m = menu.getBoundingClientRect();
    const t = trigger.getBoundingClientRect();
    const fitsRight = m.right + sub.offsetWidth + 4 <= window.innerWidth;
    const left = fitsRight ? m.right + 2 : m.left - sub.offsetWidth - 2;
    setSubStyle(clampToViewport(left, t.top - 5, sub.offsetWidth, sub.offsetHeight));
  }, [subOpen, position]);

  const others = groups.filter((g) => g.id !== tab.groupId);
  const run = (action: () => void) => () => {
    action();
    onDismiss();
  };

  return (
    <div ref={rootRef}>
      <div
        ref={menuRef}
        className="popmenu"
        role="menu"
        style={{ position: "fixed", ...position }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button className="popmenu__item" role="menuitem" onClick={run(onNewGroup)} onMouseEnter={() => setSubOpen(false)}>
          Add tab to new group
        </button>
        {others.length > 0 && (
          <button
            className={`popmenu__item${subOpen ? " popmenu__item--open" : ""}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={subOpen}
            data-submenu-trigger
            onMouseEnter={() => setSubOpen(true)}
            onClick={() => setSubOpen(true)}
          >
            Add tab to group
            <span className="popmenu__chevron" aria-hidden="true">›</span>
          </button>
        )}
        <button
          className="popmenu__item"
          role="menuitem"
          disabled={tab.groupId === null}
          onClick={run(onRemoveFromGroup)}
          onMouseEnter={() => setSubOpen(false)}
        >
          Remove from group
        </button>
        <button className="popmenu__item" role="menuitem" onClick={run(onGroupByFolder)} onMouseEnter={() => setSubOpen(false)}>
          Group tabs by folder
        </button>
        <div className="popmenu__sep" role="separator" />
        <button className="popmenu__item" role="menuitem" onClick={run(onCloseTab)} onMouseEnter={() => setSubOpen(false)}>
          Close tab
          <span className="popmenu__shortcut">⌘W</span>
        </button>
        <button
          className="popmenu__item"
          role="menuitem"
          disabled={!canCloseOthers}
          onClick={run(onCloseOthers)}
          onMouseEnter={() => setSubOpen(false)}
        >
          Close other tabs
        </button>
      </div>
      {subOpen && (
        <div ref={subRef} className="popmenu" role="menu" style={{ position: "fixed", ...subStyle }}>
          {others.map((g) => (
            <button
              key={g.id}
              className="popmenu__item"
              role="menuitem"
              style={{ "--group-color": `var(--group-${g.color})` } as CSSProperties}
              onClick={run(() => onAddToGroup(g.id))}
            >
              <span className="popmenu__swatch" aria-hidden="true" />
              {g.name || <span className="popmenu__muted">Unnamed group</span>}
              <span className="popmenu__shortcut">
                {groupSizes[g.id] ?? 0} tab{groupSizes[g.id] === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
